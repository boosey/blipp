import type { Env } from "../types";
import type { AudioInput } from "./stt-providers";
import { getProvider } from "./stt-providers";
import { calculateWer, normalizeText, stripInsertionBlocks } from "./wer";

const BENCHMARK_WINDOW_SECONDS = 900; // 15 minutes

export interface RunNextResult {
  done: boolean;
  progress: { done: number; total: number; current?: string };
}

/**
 * Execute the next pending/polling benchmark task for an experiment.
 * Called repeatedly by the frontend polling POST /experiments/:id/run.
 */
export async function runNextTask(
  experimentId: string,
  env: Env,
  prisma: any,
): Promise<RunNextResult> {
  // 1. Load experiment, verify status is RUNNING
  const experiment = await prisma.sttExperiment.findUnique({
    where: { id: experimentId },
  });

  if (!experiment) {
    throw new Error(`Experiment ${experimentId} not found`);
  }
  if (experiment.status !== "RUNNING" && experiment.status !== "COMPLETED") {
    throw new Error(
      `Experiment ${experimentId} is ${experiment.status}, expected RUNNING`,
    );
  }

  // 2. Find POLLING and PENDING tasks — handle both in parallel so async
  //    providers (AssemblyAI) don't block synchronous ones (Whisper, Deepgram).
  const [pollingResult, pendingResult] = await Promise.all([
    prisma.sttBenchmarkResult.findFirst({
      where: { experimentId, status: "POLLING" },
      include: { episode: { include: { distillation: true } } },
    }),
    prisma.sttBenchmarkResult.findFirst({
      where: { experimentId, status: "PENDING" },
      include: { episode: { include: { distillation: true } } },
    }),
  ]);

  // 3. If no tasks left, mark experiment COMPLETED
  if (!pollingResult && !pendingResult) {
    if (experiment.status !== "COMPLETED") {
      await prisma.sttExperiment.update({
        where: { id: experimentId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }
    return {
      done: true,
      progress: { done: experiment.doneTasks, total: experiment.totalTasks },
    };
  }

  // 3b. Re-open a COMPLETED experiment if orphaned POLLING/PENDING rows exist
  if (experiment.status === "COMPLETED") {
    await prisma.sttExperiment.update({
      where: { id: experimentId },
      data: { status: "RUNNING", completedAt: null },
    });
  }

  // 4. Run both in parallel: poll async job + start next pending task
  const tasks: Promise<void>[] = [];
  let currentLabel = "";

  if (pollingResult) {
    const provider = getProvider(pollingResult.model);
    currentLabel = `polling ${provider.name}`;
    tasks.push(
      handlePollingTask(pollingResult, provider, experiment, env, prisma).catch(
        async (err: any) => {
          await markFailed(pollingResult, experimentId, err, prisma);
        },
      ),
    );
  }

  if (pendingResult) {
    const provider = getProvider(pendingResult.model);
    currentLabel = `${provider.name} @ ${pendingResult.speed}x — ${pendingResult.episode.title}`;
    tasks.push(
      handlePendingTask(pendingResult, provider, experiment, env, prisma).catch(
        async (err: any) => {
          await markFailed(pendingResult, experimentId, err, prisma);
        },
      ),
    );
  }

  await Promise.all(tasks);

  // Reload experiment for updated progress
  const updated = await prisma.sttExperiment.findUnique({
    where: { id: experimentId },
  });

  return {
    done: false,
    progress: {
      done: updated.doneTasks,
      total: updated.totalTasks,
      current: currentLabel,
    },
  };
}

async function markFailed(
  result: any,
  experimentId: string,
  err: any,
  prisma: any,
): Promise<void> {
  await prisma.sttBenchmarkResult.update({
    where: { id: result.id },
    data: {
      status: "FAILED",
      errorMessage: err?.message || String(err),
    },
  });
  await prisma.sttExperiment.update({
    where: { id: experimentId },
    data: { doneTasks: { increment: 1 } },
  });
}

/**
 * Strip ad insertion blocks from hypothesis, truncate reference to match,
 * then compute WER.
 *
 * Two-pass approach:
 * 1. Generous rough-cut of reference (1.5x hypothesis length) for alignment
 * 2. Strip ad blocks from hypothesis using alignment
 * 3. Tight truncation of reference to cleaned hypothesis length (1.2x margin)
 * 4. Compute WER on the size-matched pair
 */
function calculateCleanWer(
  hypothesis: string,
  reference: string,
): { wer: number; wordCount: number; refWordCount: number } {
  const hypWords = normalizeText(hypothesis);
  const allRefWords = normalizeText(reference);

  // Pass 1: generous cut for alignment (captures enough context to find ads)
  const roughLimit = Math.ceil(hypWords.length * 1.5);
  const roughRef = allRefWords.length > roughLimit
    ? allRefWords.slice(0, roughLimit)
    : allRefWords;

  // Pass 2: strip ad blocks using rough-cut alignment
  const cleanedHyp = stripInsertionBlocks(hypWords, roughRef);

  // Pass 3: tight truncation based on cleaned hypothesis length
  const tightLimit = Math.ceil(cleanedHyp.length * 1.2);
  const finalRef = allRefWords.length > tightLimit
    ? allRefWords.slice(0, tightLimit)
    : allRefWords;

  return calculateWer(cleanedHyp.join(" "), finalRef.join(" "));
}

// ---------------------------------------------------------------------------
// Handle POLLING task (resume async transcription)
// ---------------------------------------------------------------------------

async function handlePollingTask(
  result: any,
  provider: ReturnType<typeof getProvider>,
  experiment: any,
  env: Env,
  prisma: any,
): Promise<void> {
  if (!provider.poll) {
    throw new Error(`Provider ${provider.name} does not support polling`);
  }

  const pollResult = await provider.poll(result.pollingId, env);

  if (!pollResult.done) {
    // Still processing — leave status as POLLING, don't increment doneTasks
    return;
  }

  // Transcription complete
  const transcript = pollResult.transcript ?? "";
  const referenceText = await getReferenceTranscript(result.episode, env);
  const werResult = calculateCleanWer(transcript, referenceText);

  // Store transcript to R2
  const r2TranscriptKey = `benchmark/transcripts/${experiment.id}/${result.id}.txt`;
  await env.R2.put(r2TranscriptKey, transcript);

  await prisma.sttBenchmarkResult.update({
    where: { id: result.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      wer: werResult.wer,
      wordCount: werResult.wordCount,
      refWordCount: werResult.refWordCount,
      r2TranscriptKey,
      costDollars: pollResult.costDollars ?? result.costDollars,
    },
  });

  await prisma.sttExperiment.update({
    where: { id: experiment.id },
    data: { doneTasks: { increment: 1 } },
  });
}

// ---------------------------------------------------------------------------
// Handle PENDING task (start new transcription)
// ---------------------------------------------------------------------------

async function handlePendingTask(
  result: any,
  provider: ReturnType<typeof getProvider>,
  experiment: any,
  env: Env,
  prisma: any,
): Promise<void> {
  // Mark as RUNNING
  await prisma.sttBenchmarkResult.update({
    where: { id: result.id },
    data: { status: "RUNNING" },
  });

  // Determine audio input: R2 (sped-up) or original episode URL
  const audio = await resolveAudioInput(result, env);
  const durationSeconds = result.episode.durationSeconds
    ? Math.round(result.episode.durationSeconds / result.speed)
    : 900; // fallback to 15 min

  const sttResult = await provider.transcribe(audio, durationSeconds, env);

  if (sttResult.async) {
    // Async provider (AssemblyAI, Google) — save job ID and poll later
    await prisma.sttBenchmarkResult.update({
      where: { id: result.id },
      data: {
        status: "POLLING",
        pollingId: sttResult.async.jobId,
        costDollars: sttResult.costDollars,
        latencyMs: sttResult.latencyMs,
      },
    });
    // Don't increment doneTasks yet — will complete on poll
    return;
  }

  // Sync result — compute WER and save
  const transcript = sttResult.transcript;
  const referenceText = await getReferenceTranscript(result.episode, env);
  const werResult = calculateCleanWer(transcript, referenceText);

  // Store transcript to R2
  const r2TranscriptKey = `benchmark/transcripts/${experiment.id}/${result.id}.txt`;
  await env.R2.put(r2TranscriptKey, transcript);

  await prisma.sttBenchmarkResult.update({
    where: { id: result.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      costDollars: sttResult.costDollars,
      latencyMs: sttResult.latencyMs,
      wer: werResult.wer,
      wordCount: werResult.wordCount,
      refWordCount: werResult.refWordCount,
      r2TranscriptKey,
    },
  });

  await prisma.sttExperiment.update({
    where: { id: experiment.id },
    data: { doneTasks: { increment: 1 } },
  });
}

// ---------------------------------------------------------------------------
// Audio resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the audio source for a benchmark result.
 * If the result has an r2AudioKey (sped-up audio), read from R2 as buffer.
 * Otherwise fetch the episode's original audio URL, truncated to ~15 minutes
 * via byte-range to avoid sending (and paying for) full-length episodes.
 */
async function resolveAudioInput(result: any, env: Env): Promise<AudioInput> {
  if (result.r2AudioKey) {
    const obj = await env.R2.get(result.r2AudioKey);
    if (!obj) {
      throw new Error(`R2 object not found: ${result.r2AudioKey}`);
    }
    const buffer = await obj.arrayBuffer();
    // Extract filename from key, e.g. "benchmark/tmp/.../1.5.mp3" -> "1.5.mp3"
    const filename = result.r2AudioKey.split("/").pop() || "audio.mp3";
    return { buffer, filename };
  }

  // Fallback: fetch original audio, truncated to 15 minutes.
  // Estimate max bytes: 15 min * 192kbps (generous upper-bound for podcasts) / 8
  const MAX_BYTES = BENCHMARK_WINDOW_SECONDS * 192_000 / 8; // ~21.6 MB
  const resp = await fetch(result.episode.audioUrl, {
    headers: { Range: `bytes=0-${MAX_BYTES - 1}` },
  });

  if (!resp.ok && resp.status !== 206) {
    throw new Error(`Audio fetch failed: HTTP ${resp.status} for ${result.episode.audioUrl}`);
  }

  const buffer = await resp.arrayBuffer();
  const urlPath = new URL(result.episode.audioUrl).pathname;
  const filename = urlPath.split("/").pop() || "audio.mp3";
  return { buffer, filename };
}

// ---------------------------------------------------------------------------
// Reference transcript
// ---------------------------------------------------------------------------

/**
 * Get the official/external reference transcript for WER comparison.
 * Only uses transcriptUrl (from the podcast's RSS feed) — never the Blipp
 * distillation transcript, which is itself Whisper output and would make
 * the WER comparison meaningless.
 */
async function getReferenceTranscript(
  episode: any,
  _env: Env,
): Promise<string> {
  if (episode.transcriptUrl) {
    const resp = await fetch(episode.transcriptUrl);
    if (resp.ok) {
      return resp.text();
    }
    throw new Error(
      `Failed to fetch reference transcript from ${episode.transcriptUrl}: ${resp.status}`,
    );
  }

  throw new Error(
    `No official reference transcript available for episode ${episode.id}`,
  );
}


