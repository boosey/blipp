import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockApiFetch } = vi.hoisted(() => {
  return { mockApiFetch: vi.fn() };
});

vi.mock("@clerk/clerk-react", () => ({
  useAuth: vi.fn(() => ({ getToken: vi.fn(() => Promise.resolve("token")) })),
  ClerkProvider: ({ children }: any) => children,
}));

vi.mock("@/lib/admin-api", () => ({
  useAdminFetch: () => mockApiFetch,
}));

import { FeedRefreshCard } from "../components/admin/feed-refresh-card";

const mockSummary = {
  data: {
    lastRunAt: new Date(Date.now() - 300000).toISOString(), // 5m ago
    podcastsRefreshed: 12,
    totalPodcasts: 15,
    totalEpisodes: 500,
    recentEpisodes: 7,
    prefetchedTranscripts: 120,
    prefetchedAudio: 80,
    feedErrors: 2,
  },
};

describe("FeedRefreshCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockImplementation((path: string) => {
      if (path.includes("feed-refresh-summary")) return Promise.resolve(mockSummary);
      if (path.includes("catalog-refresh")) return Promise.resolve({ data: { feedsFound: 200, created: 185, updated: 15, refreshesQueued: 200 } });
      return Promise.resolve({ data: null });
    });
  });

  it("renders feed refresh summary data", async () => {
    render(<FeedRefreshCard />);
    await waitFor(() => {
      expect(screen.getByText("Feed Refresh")).toBeInTheDocument();
    });

    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("(12 refreshed)")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("triggers catalog refresh on button click", async () => {
    const user = userEvent.setup();
    render(<FeedRefreshCard />);

    await waitFor(() => {
      expect(screen.getByTestId("feed-refresh-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("feed-refresh-button"));

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/podcasts/catalog-refresh",
      { method: "POST" }
    );
  });

  it("renders compact variant", async () => {
    render(<FeedRefreshCard compact />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-refresh-card")).toBeInTheDocument();
    });

    // Compact shows inline stats
    expect(screen.getByText(/15/)).toBeInTheDocument();
    expect(screen.getByText(/podcasts/)).toBeInTheDocument();
    expect(screen.getByText(/2 errors/)).toBeInTheDocument();
  });
});
