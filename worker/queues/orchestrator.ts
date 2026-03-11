import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import type { Env } from "../types";

interface OrchestratorMessage {
  requestId: string;
  action: "evaluate" | "job-stage-complete";
  jobId?: string;
}

interface BriefingRequestItem {
  podcastId: string;
  episodeId: string | null;
  durationTier: number;
  useLatest: boolean;
}

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

        if (!request || request.status === "COMPLETED" || request.status === "FAILED") {
          log.info("request_skipped", { requestId, reason: request ? `status=${request.status}` : "not_found" });
          msg.ack();
          continue;
        }

        if (action === "evaluate") {
          await handleEvaluate(prisma, env, log, request, msg);
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
          .catch(() => null);

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
  prisma: any,
  env: Env,
  log: any,
  request: any,
  msg: Message<OrchestratorMessage>
): Promise<void> {
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
  const resolvedItems: Array<{ episodeId: string; durationTier: number }> = [];
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

    resolvedItems.push({ episodeId: episodeId!, durationTier: item.durationTier });
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

  // Create PipelineJobs and dispatch to transcription
  for (const resolved of resolvedItems) {
    const job = await prisma.pipelineJob.create({
      data: {
        requestId: request.id,
        episodeId: resolved.episodeId,
        durationTier: resolved.durationTier,
        status: "PENDING",
        currentStage: "TRANSCRIPTION",
      },
    });

    await env.TRANSCRIPTION_QUEUE.send({
      jobId: job.id,
      episodeId: resolved.episodeId,
    });

    log.info("job_created_and_dispatched", {
      jobId: job.id,
      episodeId: resolved.episodeId,
      durationTier: resolved.durationTier,
      stage: "TRANSCRIPTION",
    });
  }

  msg.ack();
}

async function handleJobStageComplete(
  prisma: any,
  env: Env,
  log: any,
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

  if (job.status === "COMPLETED" || job.status === "FAILED") {
    log.info("job_already_terminal", { jobId, status: job.status });
    msg.ack();
    return;
  }

  const nextStage = NEXT_STAGE[job.currentStage];

  if (nextStage) {
    // Advance to next stage
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { currentStage: nextStage, status: "IN_PROGRESS" },
    });

    const queueBinding = STAGE_QUEUE_MAP[nextStage];
    const message: Record<string, any> = { jobId, episodeId: job.episodeId };
    if (nextStage === "NARRATIVE_GENERATION" || nextStage === "AUDIO_GENERATION") {
      message.durationTier = job.durationTier;
    }

    await env[queueBinding].send(message);

    log.info("job_stage_advanced", { jobId, from: job.currentStage, to: nextStage });
    msg.ack();
  } else {
    // Terminal stage (clip gen done) - mark job completed
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    log.info("job_completed", { jobId });

    // Check if ALL jobs for this request are done
    const allJobs = await prisma.pipelineJob.findMany({
      where: { requestId: request.id },
    });
    const pendingOrInProgress = allJobs.filter(
      (j: any) => j.status !== "COMPLETED" && j.status !== "FAILED"
    );

    if (pendingOrInProgress.length === 0) {
      await env.BRIEFING_ASSEMBLY_QUEUE.send({ requestId: request.id });
      log.info("assembly_dispatched", { requestId: request.id });
    }

    msg.ack();
  }
}
