/** Google Ads conversion tracking helper. */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const ADS_CONVERSION_ID = "AW-18076796933";
const SIGNUP_CONVERSION_LABEL = "5Z83CPrJlJkcEIWQ2KtD";

/** Fire a Google Ads conversion event (e.g. sign-up). */
export function trackSignUpConversion() {
  if (typeof window.gtag === "function") {
    window.gtag("event", "conversion", {
      send_to: `${ADS_CONVERSION_ID}/${SIGNUP_CONVERSION_LABEL}`,
    });
  }
}

/** Fire a custom GA4 event. */
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window.gtag === "function") {
    window.gtag("event", name, params);
  }
}
