import { Hono } from "hono";
import type { Env } from "../types";
import { podcasts } from "./podcasts";
import { briefings } from "./briefings";
import { billing } from "./billing";
import { clerkWebhooks } from "./webhooks/clerk";
import { stripeWebhooks } from "./webhooks/stripe";

/**
 * Combined route tree for the Blipp API.
 * Mounted at /api by the main worker entry point.
 */
const routes = new Hono<{ Bindings: Env }>();

routes.route("/podcasts", podcasts);
routes.route("/briefings", briefings);
routes.route("/billing", billing);
routes.route("/webhooks/clerk", clerkWebhooks);
routes.route("/webhooks/stripe", stripeWebhooks);

export { routes };
