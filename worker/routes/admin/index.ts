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

export { adminRoutes };
