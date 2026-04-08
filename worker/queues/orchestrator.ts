import { createPrismaClient, type PrismaClient } from "../lib/db";
import { createPipelineLogger, type PipelineLogger } from "../lib/logger";
import { checkDigestProgress } from "../lib/digest-helpers";
import type {
  OrchestratorMessage, BriefingRequestItem,
  TranscriptionMessage, DistillationMessage, NarrativeGenerationMessage, AudioGenerationMessage,
} from "../lib/queue-messages";
import type { Env } from "../types";

const TERMINAL_STATUSES = ["COMPLETED", "COMPLETED_DEGRADED", "FAILED", "CANCELLED"] as const;
function isTerminal(status: string) { return TERMINAL_STATUSES.includes(status as any); }
function isCompleted(status: string) { return status === "COMPLETED" || status === "COMPLETED_DEGRADED"; }

const NEXT_STAGE: Record<string, string | null> = {
  TRANSCRIPTION: "DISTILLATION",
  DISTILLATION: "NARRATIVE_GENERATION",
  NARRATIVE_GENERATION: "AUDIO_GENERATION",
  AUDIO_GENERATION: null,
};

const STAGE_QUEUE_MAP: Record<string, keyof Pick<Env, "TRANSCRIPTION_QUEUE" | "DISTILLATION_QUEUE" | "NARRATIVE_GENERATION_QUEUE" | "AUDIO_GENERATION_QUEUE">> = {
  TRANSCRIPTION: "TRANSCRIPTION_QUEUE",
  DISTILLATION: "DISTILLATION_QUEUE",
  NARRATIVE_GENERATION: "NARRATIVE_GENERATION_QUEUE",
  AUDIO_GENERATION: "AUDIO_GENERATION_QUEUE",
};

export async function handleOrchestrator(
  batch: MessageBatch<OrchestratorMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    for (const msg of batch.messages) {
      const { requestId, action, jobId } = msg.body;
      const log = await createPipelineLogger({ stage: "orchestrator", requestId, prisma });

      try {
        log.info("message_received", { action, jobId });

        const request = await prisma.briefingRequest.findUnique({
          where: { id: requestId },
        });

        if (!request || isTerminal(request.status)) {
          log.info("request_skipped", { requestId, reason: request ? `status=${request.status}` : "not_found" });
          msg.ack();
          continue;
        }

        if (action === "evaluate") {
          await handleEvaluate(prisma, env, log, request, msg);
        } else if (action === "job-failed") {
          await handleJobFailed(prisma, env, log, request, jobId!, msg.body.errorMessage ?? "Unknown error", msg);
        } else if (action === "job-stage-complete") {
          await handleJobStageComplete(prisma, env, log, request, jobId!, msg);
        } else {
          log.info("unknown_action", { action });
          msg.ack();
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("request_error", { requestId }, err);

        const exists = await prisma.briefingRequest
          .update({
            where: { id: requestId },
            data: { status: "FAILED", errorMessage },
          })
          .catch((dbErr: unknown) => {
            console.error(JSON.stringify({
              level: "error",
              action: "error_path_db_write_failed",
              stage: "orchestrator",
              target: "briefingRequest",
              requestId,
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
              ts: new Date().toISOString(),
            }));
            return null;
          });

        if (!exists) {
          log.info("request_deleted_ack", { requestId });
          msg.ack();
        } else {
          msg.retry();
        }
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}

async function handleEvaluate(
  prisma: PrismaClient,
  env: Env,
  log: PipelineLogger,
  request: any,
  msg: Message<OrchestratorMessage>
): Promise<void> {
  // Enforce concurrent pipeline job limit
  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    include: { plan: { select: { concurrentPipelineJobs: true } } },
  });
  if (user?.plan) {
    const { checkConcurrentJobLimit } = await import("../lib/plan-limits");
    const limitErr = await checkConcurrentJobLimit(
      request.userId,
      user.plan.concurrentPipelineJobs,
      prisma
    );
    if (limitErr) {
      // Re-queue so it can be picked up when slots free up
      log.info("concurrent_limit_reached", {
        requestId: request.id,
        userId: request.userId,
        limit: user.plan.concurrentPipelineJobs,
      });
      msg.retry();
      return;
    }
  }

  const items = request.items as BriefingRequestItem[];

  if (!items || items.length === 0) {
    await prisma.briefingRequest.update({
      where: { id: request.id },
      data: { status: "FAILED", errorMessage: "No items in request" },
    });
    log.info("request_failed", { requestId: request.id, reason: "No items in request" });
    msg.ack();
    return;
  }

  // Resolve useLatest items to actual episodeIds
  const resolvedItems: Array<{ episodeId: string; durationTier: number; voicePresetId?: string }> = [];
  for (const item of items) {
    let episodeId = item.episodeId;

    if (item.useLatest || !episodeId) {
      const episode = await prisma.episode.findFirst({
        where: { podcastId: item.podcastId },
        orderBy: { publishedAt: "desc" },
        select: { id: true },
      });
      if (episode) {
        episodeId = episode.id;
      } else {
        log.info("no_episode_for_podcast", { podcastId: item.podcastId });
        continue;
      }
    }

    resolvedItems.push({ episodeId: episodeId!, durationTier: item.durationTier, voicePresetId: item.voicePresetId });
  }

  if (resolvedItems.length === 0) {
    await prisma.briefingRequest.update({
      where: { id: request.id },
      data: { status: "FAILED", errorMessage: "No episodes found for any requested podcasts" },
    });
    log.info("request_failed", { requestId: request.id, reason: "No episodes resolved" });
    msg.ack();
    return;
  }

  // Set request to PROCESSING
  await prisma.briefingRequest.update({
    where: { id: request.id },
    data: { status: "PROCESSING" },
  });
  log.info("request_status_transition", { requestId: request.id, from: request.status, to: "PROCESSING" });

  // Create PipelineJobs — query DB to find optimal entry stage per item,
  // avoiding unnecessary queue hops for cached work products.
  // Two batch queries replace up to N*4 sequential R2 HEAD calls.
  const episodeIds = resolvedItems.map(r => r.episodeId);

  const [existingProducts, completedClips] = await Promise.all([
    prisma.workProduct.findMany({
      where: { episodeId: { in: episodeIds }, type: { in: ["AUDIO_CLIP", "NARRATIVE", "CLAIMS", "TRANSCRIPT"] } },
      select: { type: true, episodeId: true, durationTier: true, voice: true },
    }),
    prisma.clip.findMany({
      where: { episodeId: { in: episodeIds }, status: "COMPLETED" },
      select: { id: true, episodeId: true, durationTier: true, voicePresetId: true },
    }),
  ]);

  let assemblyReadyCount = 0;
  for (const resolved of resolvedItems) {
    const { episodeId, durationTier } = resolved;
    const voiceTag = resolved.voicePresetId ?? "default";

    // Check cached work products from DB (reverse order: final product first)
    type WpRow = { type: string; episodeId: string; durationTier: number | null; voice: string | null };
    type ClipRow = { id: string; episodeId: string; durationTier: number; voicePresetId: string | null };
    const products = (existingProducts as WpRow[]).filter((wp) => wp.episodeId === episodeId);
    let entryStage: string = "TRANSCRIPTION";
    let clipId: string | null = null;

    // 1. Audio clip exists + Clip record is COMPLETED → skip to assembly
    const hasAudio = products.some((wp) => wp.type === "AUDIO_CLIP" && wp.durationTier === durationTier && (wp.voice ?? "default") === voiceTag);
    if (hasAudio) {
      const completedClip = (completedClips as ClipRow[]).find((c) =>
        c.episodeId === episodeId && c.durationTier === durationTier && (c.voicePresetId ?? null) === (resolved.voicePresetId ?? null)
      );
      if (completedClip) {
        entryStage = "BRIEFING_ASSEMBLY";
        clipId = completedClip.id;
      } else {
        entryStage = "AUDIO_GENERATION";
      }
    }

    // 2. Narrative exists → start at audio generation
    if (entryStage === "TRANSCRIPTION") {
      if (products.some((wp) => wp.type === "NARRATIVE" && wp.durationTier === durationTier)) {
        entryStage = "AUDIO_GENERATION";
      }
    }

    // 3. Claims exist → start at narrative generation
    if (entryStage === "TRANSCRIPTION") {
      if (products.some((wp) => wp.type === "CLAIMS")) {
        entryStage = "NARRATIVE_GENERATION";
      }
    }

    // 4. Transcript exists → start at distillation
    if (entryStage === "TRANSCRIPTION") {
      if (products.some((wp) => wp.type === "TRANSCRIPT")) {
        entryStage = "DISTILLATION";
      }
    }

    if (entryStage === "BRIEFING_ASSEMBLY") {
      // Fully cached — mark job as assembly-ready immediately
      const job = await prisma.pipelineJob.create({
        data: {
          requestId: request.id,
          episodeId,
          durationTier,
          voicePresetId: resolved.voicePresetId ?? null,
          status: "PENDING",
          currentStage: "BRIEFING_ASSEMBLY",
          clipId,
        },
      });
      assemblyReadyCount++;

      log.info("job_created_cache_hit", {
        jobId: job.id,
        episodeId,
        durationTier,
        entryStage,
      });
    } else {
      // Dispatch to the earliest stage that needs work
      const job = await prisma.pipelineJob.create({
        data: {
          requestId: request.id,
          episodeId,
          durationTier,
          voicePresetId: resolved.voicePresetId ?? null,
          status: "PENDING",
          currentStage: entryStage as any,
        },
      });

      const queueBinding = STAGE_QUEUE_MAP[entryStage];
      const message = buildStageMessage(entryStage, {
        jobId: job.id, episodeId, correlationId: request.id,
        durationTier, voicePresetId: resolved.voicePresetId ?? null,
      });

      await env[queueBinding].send(message);

      log.info("job_created_and_dispatched", {
        jobId: job.id,
        episodeId,
        durationTier,
        stage: entryStage,
      });
    }
  }

  // If every job is already assembly-ready, dispatch assembly now
  // (no stage-complete messages will arrive to trigger it otherwise)
  if (assemblyReadyCount === resolvedItems.length) {
    await env.BRIEFING_ASSEMBLY_QUEUE.send({ requestId: request.id, correlationId: request.id });
    log.info("assembly_dispatched_all_cached", { requestId: request.id, jobCount: assemblyReadyCount });
  }

  msg.ack();
}

/** Build a typed queue message for a pipeline stage. */
function buildStageMessage(
  stage: string,
  ctx: { jobId: string; episodeId: string; correlationId?: string; durationTier?: number; voicePresetId?: string | null },
): TranscriptionMessage | DistillationMessage | NarrativeGenerationMessage | AudioGenerationMessage {
  const base = { jobId: ctx.jobId, episodeId: ctx.episodeId, correlationId: ctx.correlationId };
  switch (stage) {
    case "AUDIO_GENERATION":
      return { ...base, durationTier: ctx.durationTier!, voicePresetId: ctx.voicePresetId };
    case "NARRATIVE_GENERATION":
      return { ...base, durationTier: ctx.durationTier! };
    default:
      return base;
  }
}

async function handleJobStageComplete(
  prisma: PrismaClient,
  env: Env,
  log: PipelineLogger,
  request: any,
  jobId: string,
  msg: Message<OrchestratorMessage>
): Promise<void> {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    log.info("job_not_found", { jobId });
    msg.ack();
    return;
  }

  if (isTerminal(job.status)) {
    log.info("job_already_terminal", { jobId, status: job.status });
    msg.ack();
    return;
  }

  // Use completedStage from message (authoritative) rather than job.currentStage
  // (which may be stale due to Hyperdrive read caching).
  const STAGE_ORDER = ["TRANSCRIPTION", "DISTILLATION", "NARRATIVE_GENERATION", "AUDIO_GENERATION"];
  const completedStage = msg.body.completedStage ?? job.currentStage;
  const completedIdx = STAGE_ORDER.indexOf(completedStage);
  const currentIdx = STAGE_ORDER.indexOf(job.currentStage);

  // Drop if the job has already advanced past the reported stage
  if (completedIdx >= 0 && currentIdx >= 0 && completedIdx < currentIdx) {
    log.info("stage_already_advanced", { jobId, completedStage, currentStage: job.currentStage });
    msg.ack();
    return;
  }

  const nextStage = NEXT_STAGE[completedStage];

  if (nextStage) {
    // Atomic CAS: advance from completedStage → nextStage.
    // Uses completedStage (from message) as the CAS condition, not the potentially
    // stale job.currentStage from Hyperdrive. Only one concurrent handler wins.
    const advanced = await prisma.pipelineJob.updateMany({
      where: { id: jobId, currentStage: completedStage as any },
      data: { currentStage: nextStage as any, status: "IN_PROGRESS" },
    });

    if (advanced.count === 0) {
      log.info("cas_failed_already_advanced", { jobId, from: completedStage, to: nextStage });
      msg.ack();
      return;
    }

    const queueBinding = STAGE_QUEUE_MAP[nextStage];
    const message = buildStageMessage(nextStage, {
      jobId, episodeId: job.episodeId, correlationId: msg.body.correlationId,
      durationTier: job.durationTier, voicePresetId: job.voicePresetId ?? null,
    });

    await env[queueBinding].send(message);

    log.info("job_stage_advanced", { jobId, from: completedStage, to: nextStage });

    // Bridge: check if this episode is part of a pending digest delivery
    await checkDigestProgress(prisma, job.episodeId, env).catch((err) => {
      log.error("digest_bridge_error", { jobId, episodeId: job.episodeId }, err);
    });

    msg.ack();
  } else {
    // Final per-job stage (AUDIO_GENERATION) complete — advance job to BRIEFING_ASSEMBLY PENDING.
    // The job stays visible in the assembly column until briefing-assembly.ts marks it COMPLETED.
    const advanced = await prisma.pipelineJob.updateMany({
      where: { id: jobId, status: { notIn: ["COMPLETED", "COMPLETED_DEGRADED"] } },
      data: { currentStage: "BRIEFING_ASSEMBLY", status: "PENDING" },
    });

    if (advanced.count === 0) {
      log.info("job_already_completed", { jobId });
      msg.ack();
      return;
    }

    log.info("job_advanced_to_assembly", { jobId });

    // Bridge: check if this episode is part of a pending digest delivery
    await checkDigestProgress(prisma, job.episodeId, env).catch((err) => {
      log.error("digest_bridge_error", { jobId, episodeId: job.episodeId }, err);
    });

    // Dispatch assembly once no jobs remain in stages 1–4 (all are FAILED or queued for assembly)
    const allJobs = await prisma.pipelineJob.findMany({
      where: { requestId: request.id },
    });
    const stillInEarlierStages = allJobs.filter(
      (j: any) =>
        j.status !== "FAILED" &&
        !(j.currentStage === "BRIEFING_ASSEMBLY" && j.status === "PENDING")
    );

    if (stillInEarlierStages.length === 0) {
      await env.BRIEFING_ASSEMBLY_QUEUE.send({ requestId: request.id, correlationId: msg.body.correlationId });
      log.info("assembly_dispatched", { requestId: request.id });
    }

    msg.ack();
  }
}

async function handleJobFailed(
  prisma: PrismaClient,
  env: Env,
  log: PipelineLogger,
  request: any,
  jobId: string,
  errorMessage: string,
  msg: Message<OrchestratorMessage>
): Promise<void> {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    log.info("job_not_found", { jobId });
    msg.ack();
    return;
  }

  if (isTerminal(job.status)) {
    log.info("job_already_terminal", { jobId, status: job.status });
    msg.ack();
    return;
  }

  // Mark job as FAILED
  await prisma.pipelineJob.update({
    where: { id: jobId },
    data: { status: "FAILED", errorMessage, completedAt: new Date() },
  });

  log.info("job_failed", { jobId, stage: job.currentStage, errorMessage });

  // Check if ALL jobs for this request are now terminal or queued for assembly
  const allJobs = await prisma.pipelineJob.findMany({
    where: { requestId: request.id },
  });
  const stillInEarlierStages = allJobs.filter(
    (j: any) =>
      j.status !== "FAILED" &&
      !(j.currentStage === "BRIEFING_ASSEMBLY" && j.status === "PENDING")
  );

  if (stillInEarlierStages.length === 0) {
    await env.BRIEFING_ASSEMBLY_QUEUE.send({ requestId: request.id, correlationId: msg.body.correlationId });
    log.info("assembly_dispatched_after_failure", { requestId: request.id });
  }

  msg.ack();
}
