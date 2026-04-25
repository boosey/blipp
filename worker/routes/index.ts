import { Hono } from "hono";
import type { Env } from "../types";
import { me } from "./me";
import { plans } from "./plans";
import { podcasts } from "./podcasts";
import { subscriptions } from "./subscriptions";
import { briefings } from "./briefings";
import { feed } from "./feed";
import { clips } from "./clips";
import { billing } from "./billing";
import { iap } from "./iap";
import { recommendations } from "./recommendations";
import { voicePresets } from "./voice-presets";
import { clerkWebhooks } from "./webhooks/clerk";
import { stripeWebhooks } from "./webhooks/stripe";
import { revenuecatWebhooks } from "./webhooks/revenuecat";
import { adminRoutes } from "./admin/index";
import { assetsRoutes } from "./assets";
import { cleanR2Routes } from "./admin/clean-r2";
import { feedback } from "./feedback";
import { blippFeedback } from "./blipp-feedback";
import { support } from "./support";
import { blipps } from "./blipps";
import { events } from "./events";

/**
 * Combined route tree for the Blipp API.
 * Mounted at /api by the main worker entry point.
 */
const routes = new Hono<{ Bindings: Env }>();

routes.route("/me", me);
routes.route("/plans", plans);
routes.route("/podcasts", podcasts);
routes.route("/subscriptions", subscriptions);
routes.route("/briefings", briefings);
routes.route("/feed", feed);
routes.route("/clips", clips);
routes.route("/blipps", blipps);
routes.route("/billing", billing);
routes.route("/iap", iap);
routes.route("/recommendations", recommendations);
routes.route("/voice-presets", voicePresets);
routes.route("/feedback", feedback);
routes.route("/feedback/blipp", blippFeedback);
routes.route("/support", support);
routes.route("/events", events);
routes.route("/webhooks/clerk", clerkWebhooks);
routes.route("/webhooks/stripe", stripeWebhooks);
routes.route("/webhooks/revenuecat", revenuecatWebhooks);
routes.route("/admin", adminRoutes);
routes.route("/internal/clean", cleanR2Routes);
routes.route("/assets", assetsRoutes);

export { routes };
