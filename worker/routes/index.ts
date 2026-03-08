import { Hono } from "hono";
import type { Env } from "../types";
import { plans } from "./plans";
import { podcasts } from "./podcasts";
import { briefings } from "./briefings";
import { feed } from "./feed";
import { billing } from "./billing";
import { clerkWebhooks } from "./webhooks/clerk";
import { stripeWebhooks } from "./webhooks/stripe";
import { adminRoutes } from "./admin/index";

/**
 * Combined route tree for the Blipp API.
 * Mounted at /api by the main worker entry point.
 */
const routes = new Hono<{ Bindings: Env }>();

routes.route("/plans", plans);
routes.route("/podcasts", podcasts);
routes.route("/briefings", briefings);
routes.route("/feed", feed);
routes.route("/billing", billing);
routes.route("/webhooks/clerk", clerkWebhooks);
routes.route("/webhooks/stripe", stripeWebhooks);
routes.route("/admin", adminRoutes);

export { routes };
