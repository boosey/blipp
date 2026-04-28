// ── Briefings (per-user wrapper around shared Clip) ──

export interface AdminBriefing {
  id: string;
  userId: string;
  userEmail: string;
  userPlan: string;
  clipId: string;
  durationTier: number;
  clipStatus: string;
  actualSeconds?: number;
  audioUrl?: string;
  adAudioUrl?: string;
  episodeTitle?: string;
  episodeDurationSeconds?: number;
  podcastTitle?: string;
  podcastImageUrl?: string;
  feedItemCount: number;
  createdAt: string;
}

export interface BriefingPipelineStep {
  stage: string;
  status: string;
  cached: boolean;
  durationMs?: number;
  cost?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  workProducts?: import("./pipeline").WorkProductSummary[];
}

export interface AdminBriefingDetail {
  id: string;
  userId: string;
  userEmail: string;
  userPlan: string;
  clipId: string;
  adAudioUrl?: string;
  adAudioKey?: string;
  createdAt: string;
  clip: {
    id: string;
    durationTier: number;
    status: string;
    actualSeconds?: number;
    audioUrl?: string;
    wordCount?: number;
    episodeTitle?: string;
    episodeDurationSeconds?: number;
    podcastTitle?: string;
    podcastId?: string;
    podcastImageUrl?: string;
  };
  pipelineSteps?: BriefingPipelineStep[];
  feedItems: {
    id: string;
    status: string;
    listened: boolean;
    source: string;
    createdAt: string;
  }[];
}

// ── Users ──

export type UserSegment =
  | "all"
  | "power_users"
  | "at_risk"
  | "trial_ending"
  | "recently_cancelled"
  | "never_active";

export interface AdminUser {
  id: string;
  clerkId: string;
  email: string;
  name?: string;
  imageUrl?: string;
  plan: { id: string; name: string; slug: string };
  isAdmin: boolean;
  status: "active" | "inactive" | "churned";
  briefingCount: number;
  podcastCount: number;
  lastActiveAt?: string;
  createdAt: string;
  badges: string[];
}

export interface AdminFeedItem {
  id: string;
  status: string;
  source: string;
  durationTier: number;
  listened: boolean;
  listenedAt?: string;
  podcastTitle?: string;
  podcastImageUrl?: string;
  episodeTitle?: string;
  createdAt: string;
}

export interface AdminUserBriefing {
  id: string;
  episodeTitle?: string;
  podcastTitle?: string;
  podcastImageUrl?: string;
  durationTier?: number;
  createdAt: string;
}

export interface AdminUserFavorite {
  podcastId: string;
  podcastTitle: string;
  podcastImageUrl?: string;
  favoritedAt: string;
}

export interface AdminUserGrant {
  id: string;
  plan: { id: string; name: string; slug: string };
  endsAt: string | null;
  reason: string | null;
  grantedAt: string;
}

export interface AdminUserDetail extends AdminUser {
  stripeCustomerId?: string;
  feedItemCount: number;
  listenedCount: number;
  subscriptions: { podcastId: string; podcastTitle: string; durationTier: number; createdAt: string }[];
  briefings: AdminUserBriefing[];
  listenedItems: AdminFeedItem[];
  recentFeedItems: AdminFeedItem[];
  favorites: AdminUserFavorite[];
  activeGrant: AdminUserGrant | null;
}

export interface UserSegmentCounts {
  all: number;
  power_users: number;
  at_risk: number;
  trial_ending: number;
  recently_cancelled: number;
  never_active: number;
}
