import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { getClip, putBriefing } from "../lib/clip-cache";
import { concatMp3Buffers } from "../lib/mp3-concat";
import { allocateWordBudget } from "../lib/time-fitting";
import type { Env } from "../types";

interface OrchestratorMessage {
  requestId: string;
  action: "evaluate" | "stage-complete";
  stage?: number;
  episodeId?: string;
}

export async function handleOrchestrator(
  batch: MessageBatch<OrchestratorMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    for (const msg of batch.messages) {
      const { requestId } = msg.body;
      const log = await createPipelineLogger({ stage: "orchestrator", requestId, prisma });

      try {
        log.info("request_evaluated", { action: msg.body.action });

        const request = await prisma.briefingRequest.findUnique({
          where: { id: requestId },
        });

        if (!request || request.status === "COMPLETED" || request.status === "FAILED") {
          msg.ack();
          continue;
        }

        // Set status to PROCESSING if PENDING
        if (request.status === "PENDING") {
          await prisma.briefingRequest.update({
            where: { id: requestId },
            data: { status: "PROCESSING" },
          });
          log.info("request_status_transition", { requestId, from: "PENDING", to: "PROCESSING" });
        }

        let allReady = true;
        const readyEpisodes: Array<{ episode: any; distillation: any; clip: any }> = [];

        for (const podcastId of request.podcastIds) {
          const episode = await prisma.episode.findFirst({
            where: { podcastId },
            orderBy: { publishedAt: "desc" },
            include: { distillation: true, clips: true },
          });

          if (!episode) continue;

          const dist = episode.distillation;
          const clips = episode.clips || [];

          log.debug("episode_evaluated", { podcastId, episodeId: episode.id, status: dist?.status ?? "no_distillation" });

          // Check what stage the episode needs
          if (!dist || dist.status === "FAILED" || dist.status === "PENDING") {
            // Needs transcription
            if (episode.transcriptUrl) {
              await env.TRANSCRIPTION_QUEUE.send({
                episodeId: episode.id,
                transcriptUrl: episode.transcriptUrl,
                requestId,
              });
              log.info("stage_dispatched", { stage: 2, episodeId: episode.id });
            }
            allReady = false;
          } else if (dist.status === "TRANSCRIPT_READY") {
            // Needs distillation (claim extraction)
            await env.DISTILLATION_QUEUE.send({
              episodeId: episode.id,
              requestId,
            });
            log.info("stage_dispatched", { stage: 3, episodeId: episode.id });
            allReady = false;
          } else if (dist.status === "FETCHING_TRANSCRIPT" || dist.status === "EXTRACTING_CLAIMS") {
            // In progress, wait
            allReady = false;
          } else if (dist.status === "COMPLETED") {
            // Check for completed clip
            const completedClip = clips.find((c: any) => c.status === "COMPLETED");
            if (completedClip) {
              readyEpisodes.push({ episode, distillation: dist, clip: completedClip });
            } else {
              // Needs clip generation
              await env.CLIP_GENERATION_QUEUE.send({
                episodeId: episode.id,
                distillationId: dist.id,
                durationTier: 3, // default tier
                claims: dist.claimsJson,
                requestId,
              });
              log.info("stage_dispatched", { stage: 4, episodeId: episode.id });
              allReady = false;
            }
          }
        }

        if (!allReady) {
          msg.ack();
          continue;
        }

        if (readyEpisodes.length === 0) {
          await prisma.briefingRequest.update({
            where: { id: requestId },
            data: { status: "FAILED", errorMessage: "No episodes available for briefing" },
          });
          log.info("request_failed", { requestId, reason: "No episodes available for briefing" });
          msg.ack();
          continue;
        }

        // All episodes ready -- assemble briefing
        log.info("all_episodes_ready", { requestId, episodeCount: readyEpisodes.length });

        const episodeInputs = readyEpisodes.map((re) => ({
          transcriptWordCount: re.distillation.transcript
            ? re.distillation.transcript.split(/\s+/).length
            : 1000,
        }));

        const allocations = allocateWordBudget(episodeInputs, request.targetMinutes);

        // Gather clip audio from R2
        const assemblyTimer = log.timer("briefing_assembly");
        const clipBuffers: ArrayBuffer[] = [];
        for (const alloc of allocations) {
          const re = readyEpisodes[alloc.index];
          const cached = await getClip(env.R2, re.episode.id, alloc.durationTier);
          if (cached) {
            clipBuffers.push(cached);
          }
        }

        if (clipBuffers.length === 0) {
          assemblyTimer();
          await prisma.briefingRequest.update({
            where: { id: requestId },
            data: { status: "FAILED", errorMessage: "No clip audio available" },
          });
          log.info("request_failed", { requestId, reason: "No clip audio available" });
          msg.ack();
          continue;
        }

        const finalAudio = concatMp3Buffers(clipBuffers);

        // Store assembled briefing
        const today = new Date().toISOString().split("T")[0];
        const audioKey = await putBriefing(env.R2, request.userId, today, finalAudio);

        // Create Briefing record
        const briefing = await prisma.briefing.create({
          data: {
            userId: request.userId,
            targetMinutes: request.targetMinutes,
            status: "COMPLETED",
            audioKey,
          },
        });

        // Create BriefingSegments
        for (let i = 0; i < readyEpisodes.length; i++) {
          const re = readyEpisodes[i];
          await prisma.briefingSegment.create({
            data: {
              briefingId: briefing.id,
              clipId: re.clip.id,
              orderIndex: i,
              transitionText: `Next, from ${re.episode.title}...`,
            },
          });
        }

        // Mark request as COMPLETED
        await prisma.briefingRequest.update({
          where: { id: requestId },
          data: { status: "COMPLETED", briefingId: briefing.id },
        });

        assemblyTimer();
        log.info("request_completed", { requestId, briefingId: briefing.id });

        msg.ack();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("request_error", { requestId }, err);
        await prisma.briefingRequest
          .update({
            where: { id: requestId },
            data: { status: "FAILED", errorMessage },
          })
          .catch(() => {});
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
