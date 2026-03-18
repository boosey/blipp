import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../contexts/podcast-sheet-context", () => ({
  usePodcastSheet: () => ({ podcastId: null, open: vi.fn(), close: vi.fn() }),
}));

const mockApiFetch = vi.fn();
vi.mock("../lib/api", () => ({
  useApiFetch: () => mockApiFetch,
}));

vi.mock("../contexts/plan-context", () => ({
  usePlan: () => ({
    maxDurationMinutes: 15,
    subscriptions: { limit: 10, remaining: 7, used: 3 },
    briefings: { limit: 100, remaining: 95, used: 5 },
  }),
}));

vi.mock("../components/upgrade-prompt", () => ({
  useUpgradeModal: () => ({
    showUpgrade: vi.fn(),
    UpgradeModalElement: null,
  }),
}));

vi.mock("../hooks/use-pull-to-refresh", () => ({
  usePullToRefresh: () => ({ indicator: null, bind: {} }),
}));

const mockRefetch = vi.fn();
vi.mock("../lib/use-fetch", () => ({
  useFetch: (endpoint: string) => {
    if (endpoint === "/podcasts/subscriptions") {
      return {
        data: {
          subscriptions: [
            {
              id: "sub-1",
              podcastId: "pod-1",
              durationTier: 5,
              podcast: {
                id: "pod-1",
                title: "My Podcast",
                imageUrl: null,
                author: "Author",
              },
            },
          ],
        },
        loading: false,
        error: null,
        refetch: mockRefetch,
      };
    }
    if (endpoint === "/podcasts/favorites") {
      return { data: { data: [] }, loading: false, error: null, refetch: vi.fn() };
    }
    return { data: null, loading: false, error: null, refetch: vi.fn() };
  },
}));

import { LibraryPage } from "../pages/library";

describe("LibraryPage subscription management", () => {
  it("shows manage button on subscription cards", () => {
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    );

    // Switch to Subscriptions tab
    fireEvent.click(screen.getByText("Subscriptions"));

    // The manage button has title="Manage subscription"
    const manageButton = screen.getByTitle("Manage subscription");
    expect(manageButton).toBeInTheDocument();
  });

  it("renders subscription podcast titles", () => {
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    );

    // Switch to Subscriptions tab
    fireEvent.click(screen.getByText("Subscriptions"));

    expect(screen.getByText("My Podcast")).toBeInTheDocument();
  });
});
