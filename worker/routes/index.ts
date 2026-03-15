import { Hono } from "hono";
import type { Env } from "../types";
import { me } from "./me";
import { plans } from "./plans";
import { podcasts } from "./podcasts";
import { briefings } from "./briefings";
import { feed } from "./feed";
import { clips } from "./clips";
import { billing } from "./billing";
import { ads } from "./ads";
import { clerkWebhooks } from "./webhooks/clerk";
import { stripeWebhooks } from "./webhooks/stripe";
import { adminRoutes } from "./admin/index";

/**
 * Combined route tree for the Blipp API.
 * Mounted at /api by the main worker entry point.
 */
const routes = new Hono<{ Bindings: Env }>();

routes.route("/me", me);
routes.route("/plans", plans);
routes.route("/podcasts", podcasts);
routes.route("/briefings", briefings);
routes.route("/feed", feed);
routes.route("/clips", clips);
routes.route("/billing", billing);
routes.route("/ads", ads);
routes.route("/webhooks/clerk", clerkWebhooks);
routes.route("/webhooks/stripe", stripeWebhooks);
routes.route("/admin", adminRoutes);

export { routes };
