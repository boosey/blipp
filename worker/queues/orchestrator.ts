import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { getClip, putBriefing } from "../lib/clip-cache";
import { concatMp3Buffers } from "../lib/mp3-concat";
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
  DISTILLATION: "CLIP_GENERATION",
  CLIP_GENERATION: null,
};

const STAGE_QUEUE_MAP: Record<string, keyof Pick<Env, "TRANSCRIPTION_QUEUE" | "DISTILLATION_QUEUE" | "CLIP_GENERATION_QUEUE">> = {
  TRANSCRIPTION: "TRANSCRIPTION_QUEUE",
  DISTILLATION: "DISTILLATION_QUEUE",
  CLIP_GENERATION: "CLIP_GENERATION_QUEUE",
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
    if (nextStage === "CLIP_GENERATION") {
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

    // Check if all jobs for this request are done
    await checkAndAssemble(prisma, env, log, request, msg);
  }
}

async function checkAndAssemble(
  prisma: any,
  env: Env,
  log: any,
  request: any,
  msg: Message<OrchestratorMessage>
): Promise<void> {
  const allJobs = await prisma.pipelineJob.findMany({
    where: { requestId: request.id },
  });

  const pendingOrInProgress = allJobs.filter(
    (j: any) => j.status !== "COMPLETED" && j.status !== "FAILED"
  );

  if (pendingOrInProgress.length > 0) {
    // Not all jobs done yet
    msg.ack();
    return;
  }

  const completedJobs = allJobs.filter((j: any) => j.status === "COMPLETED");
  const failedJobs = allJobs.filter((j: any) => j.status === "FAILED");

  log.info("all_jobs_done", {
    requestId: request.id,
    completed: completedJobs.length,
    failed: failedJobs.length,
  });

  if (completedJobs.length === 0) {
    await prisma.briefingRequest.update({
      where: { id: request.id },
      data: { status: "FAILED", errorMessage: "All jobs failed" },
    });
    log.info("request_failed", { requestId: request.id, reason: "All jobs failed" });
    msg.ack();
    return;
  }

  // Assembly: gather clips from completed jobs
  const clipBuffers: ArrayBuffer[] = [];
  const assembledJobs: any[] = [];

  for (const job of completedJobs) {
    if (!job.clipId) continue;

    const clip = await prisma.clip.findUnique({
      where: { id: job.clipId },
    });

    if (!clip || !clip.audioKey) continue;

    const audio = await getClip(env.R2, job.episodeId, job.durationTier);
    if (audio) {
      clipBuffers.push(audio);
      assembledJobs.push(job);
    }
  }

  if (clipBuffers.length === 0) {
    await prisma.briefingRequest.update({
      where: { id: request.id },
      data: { status: "FAILED", errorMessage: "No clip audio available for assembly" },
    });
    log.info("request_failed", { requestId: request.id, reason: "No clip audio available" });
    msg.ack();
    return;
  }

  const finalAudio = concatMp3Buffers(clipBuffers);

  const today = new Date().toISOString().split("T")[0];
  const audioKey = await putBriefing(env.R2, request.userId, today, finalAudio);

  const briefing = await prisma.briefing.create({
    data: {
      userId: request.userId,
      targetMinutes: request.targetMinutes,
      status: "COMPLETED",
      audioKey,
    },
  });

  // Create BriefingSegments
  for (let i = 0; i < assembledJobs.length; i++) {
    const job = assembledJobs[i];
    await prisma.briefingSegment.create({
      data: {
        briefingId: briefing.id,
        clipId: job.clipId,
        orderIndex: i,
        transitionText: `Segment ${i + 1}`,
      },
    });
  }

  // Mark request completed
  const errorNote = failedJobs.length > 0
    ? `Partial assembly: ${failedJobs.length} of ${allJobs.length} jobs failed`
    : null;

  await prisma.briefingRequest.update({
    where: { id: request.id },
    data: {
      status: "COMPLETED",
      briefingId: briefing.id,
      ...(errorNote ? { errorMessage: errorNote } : {}),
    },
  });

  log.info("request_completed", {
    requestId: request.id,
    briefingId: briefing.id,
    partial: failedJobs.length > 0,
  });

  msg.ack();
}
