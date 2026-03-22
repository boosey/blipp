import { Hono } from "hono";
import type { Env } from "../../types";
import { requireAdmin } from "../../middleware/admin";
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

/**
 * Admin route tree. All routes require admin authentication.
 * Mounted at /api/admin by the main route index.
 */
const adminRoutes = new Hono<{ Bindings: Env }>();

// Apply admin middleware to all admin routes
adminRoutes.use("*", requireAdmin);

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

export { adminRoutes };
