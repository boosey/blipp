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
// catalogSeedRoutes mounted in worker/index.ts (before Clerk middleware)
import { recommendationsRoutes } from "./recommendations";
import { cronJobsRoutes } from "./cron-jobs";
import { claimsBenchmarkRoutes } from "./claims-benchmark";
import { promptsRoutes } from "./prompts";
import { voicePresetsRoutes } from "./voice-presets";
import { storageRoutes } from "./storage";
import { episodeRefreshRoutes } from "./episode-refresh";
import { workerLogsRoutes } from "./worker-logs";
import { feedbackRoutes } from "./feedback";

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
    const auth = getAuth(c);
    const prisma = c.get("prisma") as any;
    if (prisma && auth?.userId) {
      const path = c.req.path;
      // Extract entity type from route path (e.g. /admin/podcasts/123 → podcast)
      const segments = path.replace(/^\/api\/admin\//, "").split("/");
      const entityType = segments[0]?.replace(/-/g, "_") ?? "unknown";
      const entityId = segments[1] ?? "";
      writeAuditLog(prisma, {
        actorId: auth.userId,
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
// catalog-seed routes are mounted separately in index.ts (before Clerk middleware)
// to allow script-token auth from GH Actions without Clerk context
adminRoutes.route("/recommendations", recommendationsRoutes);
adminRoutes.route("/cron-jobs", cronJobsRoutes);
adminRoutes.route("/claims-benchmark", claimsBenchmarkRoutes);
adminRoutes.route("/prompts", promptsRoutes);
adminRoutes.route("/voice-presets", voicePresetsRoutes);
adminRoutes.route("/storage", storageRoutes);
adminRoutes.route("/episode-refresh", episodeRefreshRoutes);
adminRoutes.route("/worker-logs", workerLogsRoutes);
adminRoutes.route("/feedback", feedbackRoutes);

export { adminRoutes };
