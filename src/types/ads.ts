export interface AdConfig {
  adsEnabled: boolean;
  preroll: { enabled: boolean; vastTagUrl: string | null };
  postroll: { enabled: boolean; vastTagUrl: string | null };
}

export interface AdEventPayload {
  briefingId: string;
  feedItemId: string;
  placement: "preroll" | "postroll";
  event: string;
  metadata?: Record<string, unknown>;
}

export type AdState = "none" | "loading-ad-config" | "preroll" | "content" | "postroll";
