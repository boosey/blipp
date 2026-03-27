import type { Env } from "../types";
import type { AudioInput } from "./stt-providers";
import { getProviderImpl } from "./stt-providers";
import { getModelPricing, calculateAudioCost } from "./ai-usage";
import { parseVTT, parseSRT } from "./transcript";
import { alignTranscriptWindow, calculateWer, normalizeText, stripInsertionBlocks } from "./wer";
import { preWerNormalize } from "./transcript-normalizer";

const BENCHMARK_WINDOW_SECONDS = 900; // 15 minutes

export interface RunNextResult {
  done: boolean;
  progress: { done: number; total: number; current?: string };
}

/**
 * Resolve the provider name for a benchmark result.
 * New results have provider set at creation; old results need a DB lookup.
 */
async function resolveProvider(result: any, prisma: any): Promise<string> {
  if (result.provider) return result.provider;
  // Legacy: look up default provider from DB
  const dbProvider = await prisma.aiModelProvider.findFirst({
    where: { isDefault: true, model: { modelId: result.model, stage: "stt" } },
  });
  if (dbProvider) return dbProvider.provider;
  throw new Error(`No provider found for model: ${result.model}`);
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
  //    providers don't block synchronous ones (Whisper, Deepgram).
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
    const providerName = await resolveProvider(pollingResult, prisma);
    const providerImpl = getProviderImpl(providerName);
    currentLabel = `polling ${providerImpl.name}`;
    tasks.push(
      handlePollingTask(pollingResult, providerImpl, experiment, env, prisma).catch(
        async (err: any) => {
          await markFailed(pollingResult, experimentId, err, prisma);
        },
      ),
    );
  }

  if (pendingResult) {
    const providerName = await resolveProvider(pendingResult, prisma);
    const providerImpl = getProviderImpl(providerName);
    currentLabel = `${providerImpl.name} @ ${pendingResult.speed}x — ${pendingResult.episode.title}`;
    tasks.push(
      handlePendingTask(pendingResult, providerImpl, experiment, env, prisma).catch(
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
 * Align hypothesis and reference to the same content window, strip ad
 * insertion blocks, then compute WER.
 *
 * 1. Anchor-based window alignment: use reference start words to skip
 *    leading ads in hypothesis, use hypothesis end words to trim reference.
 * 2. Strip remaining ad insertion blocks from hypothesis.
 * 3. Compute WER on the aligned, cleaned pair.
 */
function calculateCleanWer(
  hypothesis: string,
  reference: string,
): { wer: number; wordCount: number; refWordCount: number; cleanedHyp: string; cleanedRef: string } {
  const hypWords = normalizeText(hypothesis);
  const refWords = normalizeText(reference);

  // Pre-WER normalization: numbers → words, compounds, spelling
  const { normalizedRef, normalizedHyp } = preWerNormalize(refWords, hypWords);

  // Align to the same content window
  const { trimmedHyp, trimmedRef } = alignTranscriptWindow(normalizedHyp, normalizedRef);

  // Strip mid-transcript ad insertion blocks
  const cleanedHyp = stripInsertionBlocks(trimmedHyp, trimmedRef);

  const cleanedHypText = cleanedHyp.join(" ");
  const cleanedRefText = trimmedRef.join(" ");

  return {
    ...calculateWer(cleanedHypText, cleanedRefText),
    cleanedHyp: cleanedHypText,
    cleanedRef: cleanedRefText,
  };
}

// ---------------------------------------------------------------------------
// Handle POLLING task (resume async transcription)
// ---------------------------------------------------------------------------

async function handlePollingTask(
  result: any,
  provider: ReturnType<typeof getProviderImpl>,
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

  // Store the cleaned texts that WER was actually computed on
  const r2TranscriptKey = `benchmark/transcripts/${experiment.id}/${result.id}.txt`;
  const r2RefTranscriptKey = `benchmark/transcripts/${experiment.id}/${result.id}-ref.txt`;
  await Promise.all([
    env.R2.put(r2TranscriptKey, werResult.cleanedHyp),
    env.R2.put(r2RefTranscriptKey, werResult.cleanedRef),
  ]);

  await prisma.sttBenchmarkResult.update({
    where: { id: result.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      provider: provider.provider,
      wer: werResult.wer,
      wordCount: werResult.wordCount,
      refWordCount: werResult.refWordCount,
      r2TranscriptKey,
      r2RefTranscriptKey,
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
  provider: ReturnType<typeof getProviderImpl>,
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

  // Look up providerModelId and pricing from DB
  const dbProvider = await prisma.aiModelProvider.findFirst({
    where: { provider: result.provider, model: { modelId: result.model } },
  });
  const providerModelId = dbProvider?.providerModelId ?? result.model;
  const pricing = await getModelPricing(prisma, result.model, provider.provider);
  const costDollars = calculateAudioCost(pricing, durationSeconds);

  const sttResult = await provider.transcribe(audio, durationSeconds, env, providerModelId);

  if (sttResult.async) {
    // Async provider — save job ID and poll later
    await prisma.sttBenchmarkResult.update({
      where: { id: result.id },
      data: {
        status: "POLLING",
        pollingId: sttResult.async.jobId,
        costDollars,
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

  // Store the cleaned texts that WER was actually computed on
  const r2TranscriptKey = `benchmark/transcripts/${experiment.id}/${result.id}.txt`;
  const r2RefTranscriptKey = `benchmark/transcripts/${experiment.id}/${result.id}-ref.txt`;
  await Promise.all([
    env.R2.put(r2TranscriptKey, werResult.cleanedHyp),
    env.R2.put(r2RefTranscriptKey, werResult.cleanedRef),
  ]);

  await prisma.sttBenchmarkResult.update({
    where: { id: result.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      provider: provider.provider,
      costDollars,
      latencyMs: sttResult.latencyMs,
      wer: werResult.wer,
      wordCount: werResult.wordCount,
      refWordCount: werResult.refWordCount,
      r2TranscriptKey,
      r2RefTranscriptKey,
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
      const raw = await resp.text();
      // Parse VTT/SRT to strip timestamps, speaker labels, headers
      if (raw.trimStart().startsWith("WEBVTT") || episode.transcriptUrl.endsWith(".vtt")) {
        return parseVTT(raw);
      }
      if (episode.transcriptUrl.endsWith(".srt") || /^\d+\r?\n\d{2}:\d{2}/.test(raw.trimStart())) {
        return parseSRT(raw);
      }
      return raw; // plain text, return as-is
    }
    throw new Error(
      `Failed to fetch reference transcript from ${episode.transcriptUrl}: ${resp.status}`,
    );
  }

  throw new Error(
    `No official reference transcript available for episode ${episode.id}`,
  );
}


