import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet";
import { TierPicker } from "./tier-picker";
import { usePlan } from "../contexts/plan-context";
import { useUpgradeModal } from "./upgrade-prompt";
import type { DurationTier } from "../lib/duration-tiers";

interface SubscriptionManageSheetProps {
  subscription: {
    id: string;
    podcastId: string;
    durationTier: number | null;
    podcast: { id: string; title: string; imageUrl: string | null; author: string | null };
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTierChange: (podcastId: string, tier: number) => void;
  onUnsubscribe: (podcastId: string) => void;
}

export function SubscriptionManageSheet({
  subscription,
  open,
  onOpenChange,
  onTierChange,
  onUnsubscribe,
}: SubscriptionManageSheetProps) {
  const { maxDurationMinutes } = usePlan();
  const { showUpgrade, UpgradeModalElement } = useUpgradeModal();

  if (!subscription) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl pb-8">
        <SheetHeader>
          <div className="flex items-center gap-3">
            {subscription.podcast.imageUrl ? (
              <img
                src={subscription.podcast.imageUrl}
                alt={subscription.podcast.title}
                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <span className="text-2xl font-bold text-muted-foreground">
                  {subscription.podcast.title.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <SheetTitle className="text-base truncate">
                {subscription.podcast.title}
              </SheetTitle>
              {subscription.podcast.author && (
                <SheetDescription className="truncate">
                  {subscription.podcast.author}
                </SheetDescription>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="px-4 space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Briefing length</p>
            <TierPicker
              selected={(subscription.durationTier as DurationTier) ?? null}
              onSelect={(tier) => onTierChange(subscription.podcastId, tier)}
              maxDurationMinutes={maxDurationMinutes}
              onUpgrade={showUpgrade}
            />
            {UpgradeModalElement}
          </div>

          <button
            onClick={() => onUnsubscribe(subscription.podcastId)}
            className="w-full py-2 text-sm font-medium text-red-500 hover:text-red-400 transition-colors"
          >
            Unsubscribe
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
