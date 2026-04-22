import { Hono } from "hono";
import type { Env } from "../../types";
import { requireAdmin } from "../../middleware/admin";
import { getAuth } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit-log";
import { dashboardRoutes } from "./dashboard";
import { pipelineRoutes } from "./pipeline";
import { podcastsRoutes } from "./podcasts";
import { episodesRoutes } from "./episodes";
import { briefingsRoutes } from "./briefings";
import { usersRoutes } from "./users";
import { analyticsRoutes } from "./analytics";
import { configRoutes } from "./config";
import { requestsRoutes } from "./requests";
import { sttBenchmarkRoutes } from "./stt-benchmark";
import { aiModelsRoutes } from "./ai-models";
import { plansRoutes } from "./plans";
import { aiErrorsRoutes } from "./ai-errors";
import { auditLogRoutes } from "./audit-log";
import { apiKeysRoutes } from "./api-keys";
import { adsRoutes } from "./ads";
import { catalogSeedRoutes } from "./catalog-seed";
import { recommendationsRoutes } from "./recommendations";
import { cronJobsRoutes } from "./cron-jobs";
import { claimsBenchmarkRoutes } from "./claims-benchmark";
import { promptsRoutes } from "./prompts";
import { voicePresetsRoutes } from "./voice-presets";
import { storageRoutes } from "./storage";
import { episodeRefreshRoutes } from "./episode-refresh";
import { workerLogsRoutes } from "./worker-logs";
import { feedbackRoutes } from "./feedback";
import { blippFeedbackRoutes } from "./blipp-feedback";
import { supportRoutes } from "./support";
import { publisherReportsRoutes } from "./publisher-reports";
import { catalogPregenRoutes } from "./catalog-pregen";
import { geoTaggingRoutes } from "./geo-tagging";
import { serviceKeysRoutes } from "./service-keys";

/**
 * Admin route tree. All routes require admin authentication.
 * Mounted at /api/admin by the main route index.
 */
const adminRoutes = new Hono<{ Bindings: Env }>();

// Apply admin middleware to all admin routes
adminRoutes.use("*", requireAdmin);

// Auto-audit: log all non-GET admin requests after handler completes
adminRoutes.use("*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "OPTIONS") {
    return next();
  }
  await next();
  // Only log successful mutations (2xx)
  if (c.res.status >= 200 && c.res.status < 300) {
    // Prefer api-key identity; fall back to Clerk (which throws if skipped).
    const apiKeyUserId = c.get("apiKeyUserId") as string | undefined;
    let actorId: string | undefined = apiKeyUserId;
    if (!actorId) {
      try { actorId = getAuth(c)?.userId ?? undefined; } catch { actorId = undefined; }
    }
    const prisma = c.get("prisma") as any;
    if (prisma && actorId) {
      const path = c.req.path;
      // Extract entity type from route path (e.g. /admin/podcasts/123 → podcast)
      const segments = path.replace(/^\/api\/admin\//, "").split("/");
      const entityType = segments[0]?.replace(/-/g, "_") ?? "unknown";
      const entityId = segments[1] ?? "";
      writeAuditLog(prisma, {
        actorId,
        action: `${c.req.method.toLowerCase()}_${entityType}`,
        entityType,
        entityId,
        metadata: { path, method: c.req.method },
      });
    }
  }
});

adminRoutes.route("/dashboard", dashboardRoutes);
adminRoutes.route("/pipeline", pipelineRoutes);
adminRoutes.route("/podcasts", podcastsRoutes);
adminRoutes.route("/episodes", episodesRoutes);
adminRoutes.route("/briefings", briefingsRoutes);
adminRoutes.route("/users", usersRoutes);
adminRoutes.route("/analytics", analyticsRoutes);
adminRoutes.route("/config", configRoutes);
adminRoutes.route("/requests", requestsRoutes);
adminRoutes.route("/stt-benchmark", sttBenchmarkRoutes);
adminRoutes.route("/ai-models", aiModelsRoutes);
adminRoutes.route("/plans", plansRoutes);
adminRoutes.route("/ai-errors", aiErrorsRoutes);
adminRoutes.route("/audit-log", auditLogRoutes);
adminRoutes.route("/api-keys", apiKeysRoutes);
adminRoutes.route("/ads", adsRoutes);
adminRoutes.route("/catalog-seed", catalogSeedRoutes);
adminRoutes.route("/recommendations", recommendationsRoutes);
adminRoutes.route("/cron-jobs", cronJobsRoutes);
adminRoutes.route("/claims-benchmark", claimsBenchmarkRoutes);
adminRoutes.route("/prompts", promptsRoutes);
adminRoutes.route("/voice-presets", voicePresetsRoutes);
adminRoutes.route("/storage", storageRoutes);
adminRoutes.route("/episode-refresh", episodeRefreshRoutes);
adminRoutes.route("/worker-logs", workerLogsRoutes);
adminRoutes.route("/feedback", feedbackRoutes);
adminRoutes.route("/blipp-feedback", blippFeedbackRoutes);
adminRoutes.route("/support", supportRoutes);
adminRoutes.route("/publisher-reports", publisherReportsRoutes);
adminRoutes.route("/catalog-pregen", catalogPregenRoutes);
adminRoutes.route("/geo-tagging", geoTaggingRoutes);
adminRoutes.route("/service-keys", serviceKeysRoutes);

export { adminRoutes };
