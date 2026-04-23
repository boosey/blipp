import { Headphones } from "lucide-react";
import { SubscribeNudge } from "../../components/subscribe-nudge";
import { EmptyState } from "../../components/empty-state";
import { CuratedRow } from "../../components/curated-row";
import type { CuratedResponse } from "../../types/recommendations";

interface EmptyStateSectionProps {
  curatedData?: CuratedResponse;
}

export function EmptyStateSection({ curatedData }: EmptyStateSectionProps) {
  return (
    <div>
      <SubscribeNudge />
      <EmptyState
        icon={Headphones}
        title="No briefings yet"
        description="Subscribe to podcasts and we'll create bite-sized briefings. Or tap a podcast below to get started."
        action={{ label: "Browse All Podcasts", to: "/discover" }}
      />
      {curatedData?.rows?.[0] && (
        <CuratedRow row={{ ...curatedData.rows[0], title: "Popular Podcasts" }} />
      )}
    </div>
  );
}
