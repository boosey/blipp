export interface DigestSource {
  type: "subscribed" | "favorited" | "recommended";
  podcast: { id: string; title: string; imageUrl: string | null };
  episodeTitle: string;
  /** Seconds of the digest allocated to this source */
  segmentSeconds: number;
}

export interface Digest {
  id: string;
  date: string;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  episodeCount: number;
  actualSeconds: number | null;
  sources: DigestSource[];
  audioUrl: string | null;
  listened: boolean;
  createdAt: string;
}
