/**
 * Per-route SEO meta — single source of truth for prerender script.
 *
 * Used by `scripts/prerender.mjs` to populate <title>, <meta description>,
 * and canonical on each generated HTML file.
 */

export interface RouteSeo {
  /** Route pathname, e.g. "/about" or "/" */
  path: string;
  title: string;
  description: string;
  /** Absolute canonical URL for the page. */
  canonical: string;
  /**
   * If true, the prerender script injects the AdSense Auto Ads <script>
   * into <head>. Reserved for content-rich pages where ads should run.
   * Thin pages (legal, contact, pricing-during-async-load) are kept off
   * the AdSense crawler's "ads-enabled" surface during review.
   */
  adsScript?: boolean;
}

const SITE = "https://podblipp.com";

export const MARKETING_ROUTES: RouteSeo[] = [
  {
    path: "/",
    title: "Blipp — All Your Podcasts in a Blipp | Podcast Summaries in Minutes",
    description:
      "Blipp turns full podcast episodes into short, voice-narrated summaries. Choose 2–30 minutes and get the key insights from any episode. Hear the signal without the noise.",
    canonical: `${SITE}/`,
    // Apex is promotional landing copy — features, CTAs, app-store badge —
    // not editorial content. Ads belong on /pulse/* where the substantive
    // first-party content lives. AdSense follows the in-page "Read the
    // Pulse" link to find ad-bearing pages from here.
  },
  {
    path: "/about",
    title: "About Blipp — Podcast Summaries Built for Busy Listeners",
    description:
      "Blipp helps you stay current on every podcast you care about — without listening to every episode. Learn how Blipp summarizes shows into short, voice-narrated briefings.",
    canonical: `${SITE}/about`,
  },
  {
    path: "/pricing",
    title: "Blipp Pricing — Free + Paid Plans",
    description:
      "Compare Blipp plans. Start free, upgrade when you want more shows, longer briefings, and unlimited generation.",
    canonical: `${SITE}/pricing`,
  },
  {
    path: "/how-it-works",
    title: "How Blipp Works — From Podcast Episodes to Briefings",
    description:
      "How Blipp turns full podcast episodes into 2–30 minute voice-narrated summaries. Search any show, pick a length, get the key takeaways without the runtime.",
    canonical: `${SITE}/how-it-works`,
  },
  {
    path: "/contact",
    title: "Contact Blipp",
    description:
      "Get in touch with the Blipp team — questions, feedback, partnerships, press inquiries.",
    canonical: `${SITE}/contact`,
  },
  {
    path: "/support",
    title: "Blipp Support — Help & Feedback",
    description:
      "Need help with Blipp? Send us a support request, report a bug, or share feedback. We read every message.",
    canonical: `${SITE}/support`,
  },
  {
    path: "/tos",
    title: "Blipp Terms of Service",
    description:
      "Terms of Service for Blipp — the rights and obligations of using Blipp.",
    canonical: `${SITE}/tos`,
  },
  {
    path: "/privacy",
    title: "Blipp Privacy Policy",
    description:
      "How Blipp collects, uses, and protects your data — including data exported through your account settings.",
    canonical: `${SITE}/privacy`,
  },
];

export const SITE_URL = SITE;
