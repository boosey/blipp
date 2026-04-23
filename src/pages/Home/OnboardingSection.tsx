import { useNavigate } from "react-router-dom";
import { TopicsCard, PodcastPickerCard, DiscoverNudge } from "../../components/inline-onboarding-cards";
import { useApiFetch } from "../../lib/api-client";
import { useOnboarding } from "../../contexts/onboarding-context";
import { usePlan } from "../../contexts/plan-context";

interface OnboardingSectionProps {
  onRefresh: () => void;
}

export function OnboardingSection({ onRefresh }: OnboardingSectionProps) {
  const navigate = useNavigate();
  const apiFetch = useApiFetch();
  const { markComplete } = useOnboarding();
  const { maxDurationMinutes } = usePlan();

  async function completeOnboarding() {
    markComplete();
    sessionStorage.setItem("blipp-just-onboarded", "1");
    try {
      await apiFetch("/me/onboarding-complete", { method: "PATCH" });
    } catch {
      // Non-critical
    }
  }

  async function handleTopicsDone(categories: string[]) {
    completeOnboarding();
    try {
      await apiFetch("/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          preferredCategories: categories,
          excludedCategories: [],
          preferredTopics: [],
          excludedTopics: [],
        }),
      });
    } catch {
      // Non-critical
    }
    navigate("/discover");
  }

  function handleTopicsSkip() {
    completeOnboarding();
    onRefresh();
  }

  async function handlePodcastSubscribe(
    podcasts: { id: string; title: string; feedUrl: string; description: string | null; imageUrl: string | null; author: string | null }[]
  ) {
    completeOnboarding();
    const durationTier = Math.min(maxDurationMinutes, 5);

    await Promise.allSettled(
      podcasts.map((p) =>
        apiFetch("/podcasts/subscribe", {
          method: "POST",
          body: JSON.stringify({
            feedUrl: p.feedUrl,
            title: p.title,
            durationTier,
            description: p.description,
            imageUrl: p.imageUrl,
            author: p.author,
          }),
        })
      )
    );
    onRefresh();
  }

  function handlePodcastSkip() {
    completeOnboarding();
    onRefresh();
  }

  return (
    <div className="space-y-6">
      <TopicsCard onDone={handleTopicsDone} onSkip={handleTopicsSkip} />
      <PodcastPickerCard
        preferredCategories={[]}
        onSubscribe={handlePodcastSubscribe}
        onSkip={handlePodcastSkip}
      />
      <DiscoverNudge />
    </div>
  );
}
