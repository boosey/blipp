import type { Env } from "../types";
import type { AudioInput } from "./stt-providers";
import { getProvider } from "./stt-providers";
import { calculateWer, normalizeText } from "./wer";

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
  if (experiment.status !== "RUNNING") {
    throw new Error(
      `Experiment ${experimentId} is ${experiment.status}, expected RUNNING`,
    );
  }

  // 2. Find next result row: first try POLLING (resume async), then PENDING
  let result = await prisma.sttBenchmarkResult.findFirst({
    where: { experimentId, status: "POLLING" },
    include: { episode: { include: { distillation: true } } },
  });

  if (!result) {
    result = await prisma.sttBenchmarkResult.findFirst({
      where: { experimentId, status: "PENDING" },
      include: { episode: { include: { distillation: true } } },
    });
  }

  // 3. If no tasks left, mark experiment COMPLETED
  if (!result) {
    await prisma.sttExperiment.update({
      where: { id: experimentId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return {
      done: true,
      progress: { done: experiment.doneTasks, total: experiment.totalTasks },
    };
  }

  const provider = getProvider(result.model);

  try {
    if (result.status === "POLLING") {
      await handlePollingTask(result, provider, experiment, env, prisma);
    } else {
      await handlePendingTask(result, provider, experiment, env, prisma);
    }
  } catch (err: any) {
    // Mark task as FAILED
    await prisma.sttBenchmarkResult.update({
      where: { id: result.id },
      data: {
        status: "FAILED",
        errorMessage: err?.message || String(err),
      },
    });

    // Increment doneTasks even on failure so the experiment progresses
    await prisma.sttExperiment.update({
      where: { id: experimentId },
      data: { doneTasks: { increment: 1 } },
    });
  }

  // Reload experiment for updated progress
  const updated = await prisma.sttExperiment.findUnique({
    where: { id: experimentId },
  });

  return {
    done: false,
    progress: {
      done: updated.doneTasks,
      total: updated.totalTasks,
      current: `${provider.name} @ ${result.speed}x — ${result.episode.title}`,
    },
  };
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
  const truncatedRef = truncateReferenceToWindow(
    referenceText,
    result.episode.durationSeconds,
  );
  const werResult = calculateWer(transcript, truncatedRef);

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
  const truncatedRef = truncateReferenceToWindow(
    referenceText,
    result.episode.durationSeconds,
  );
  const werResult = calculateWer(transcript, truncatedRef);

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
 * Otherwise use the episode's original audio URL.
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

  return { url: result.episode.audioUrl };
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

/**
 * Truncate reference transcript to match the ~15 minute benchmark window.
 * Since we only transcribe the first 15 minutes of audio, we proportionally
 * truncate the reference transcript to match.
 */
function truncateReferenceToWindow(
  referenceText: string,
  episodeDurationSeconds?: number | null,
): string {
  const BENCHMARK_WINDOW_SECONDS = 900; // 15 minutes

  if (
    !episodeDurationSeconds ||
    episodeDurationSeconds <= BENCHMARK_WINDOW_SECONDS
  ) {
    return referenceText;
  }

  const refWords = normalizeText(referenceText);
  const fraction = BENCHMARK_WINDOW_SECONDS / episodeDurationSeconds;
  const wordLimit = Math.floor(refWords.length * fraction);
  return refWords.slice(0, wordLimit).join(" ");
}
