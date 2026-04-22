import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { FeedItem } from "../types/feed";

const mockPlay = vi.fn();
const mockPlayAll = vi.fn();
vi.mock("../contexts/audio-context", () => ({
  useAudio: () => ({
    play: mockPlay,
    playAll: mockPlayAll,
    pause: vi.fn(),
    resume: vi.fn(),
    currentItem: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    isLoading: false,
    error: null,
    playbackPhase: "none",
    seek: vi.fn(),
    setRate: vi.fn(),
    stop: vi.fn(),
  }),
}));

// Mock useApiFetch
const mockApiFetch = vi.fn();
vi.mock("../lib/api", () => ({
  useApiFetch: () => mockApiFetch,
}));

// Mock useFetch for counts
const mockCountsData = { total: 10, unlistened: 3, pending: 1 };
vi.mock("../lib/use-fetch", () => ({
  useFetch: (endpoint: string) => {
    if (endpoint === "/feed/counts") {
      return { data: mockCountsData, loading: false, error: null, refetch: vi.fn() };
    }
    return { data: null, loading: false, error: null, refetch: vi.fn() };
  },
}));

// Mock hooks and components
vi.mock("../hooks/use-pull-to-refresh", () => ({
  usePullToRefresh: () => ({ indicator: null, bind: {} }),
}));

vi.mock("../components/install-prompt", () => ({
  InstallPrompt: () => null,
}));

vi.mock("../contexts/podcast-sheet-context", () => ({
  usePodcastSheet: () => ({ open: vi.fn(), close: vi.fn() }),
}));

import { Home } from "../pages/Home";

const makeItem = (id: string, overrides: Partial<FeedItem> = {}): FeedItem => ({
  id,
  requestId: null,
  source: "SUBSCRIPTION",
  status: "READY",
  listened: false,
  listenedAt: null,
  playbackPositionSeconds: null,
  durationTier: 5,
  createdAt: new Date().toISOString(),
  errorMessage: null,
  podcast: { id: "p1", title: "Test Pod", imageUrl: null, podcastIndexId: null },
  episode: {
    id: `e-${id}`,
    title: `Episode ${id}`,
    publishedAt: new Date().toISOString(),
    durationSeconds: 3600,
  },
  episodeVote: 0,
  briefing: {
    id: `b-${id}`,
    clip: { audioUrl: "/audio.mp3", actualSeconds: 180, previewText: null },
    adAudioUrl: null,
  },
  ...overrides,
});

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

describe("Home Feed", () => {
  const defaultItems = [
    makeItem("1", { listened: false, status: "READY" }),
    makeItem("2", { listened: true, status: "READY" }),
    makeItem("3", { listened: false, status: "READY", source: "ON_DEMAND" }),
    makeItem("4", { listened: false, status: "PENDING", briefing: null }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ items: defaultItems });
  });

  describe("Filter pills", () => {
    it("renders filter pill buttons", async () => {
      renderHome();

      await waitFor(() => {
        expect(screen.getByText("All (10)")).toBeInTheDocument();
      });
      expect(screen.getByText(/^New/)).toBeInTheDocument();
      expect(screen.getByText("Subscriptions")).toBeInTheDocument();
      expect(screen.getByText("On Demand")).toBeInTheDocument();
      expect(screen.getByText("Creating (1)")).toBeInTheDocument();
    });

    it("shows unlistened count on New pill", async () => {
      renderHome();

      await waitFor(() => {
        expect(screen.getByText("New (3)")).toBeInTheDocument();
      });
    });

    it("changes filter when pill is clicked", async () => {
      renderHome();

      await waitFor(() => {
        expect(screen.getByText("Subscriptions")).toBeInTheDocument();
      });

      // Clear mock to track the new call
      mockApiFetch.mockClear();
      mockApiFetch.mockResolvedValue({ items: defaultItems });

      fireEvent.click(screen.getByText("Subscriptions"));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          expect.stringContaining("source=SUBSCRIPTION")
        );
      });
    });
  });

  describe("Date grouping", () => {
    it("renders date group headers", async () => {
      // Items with today's date (default from makeItem)
      renderHome();

      await waitFor(() => {
        expect(screen.getByText("Today")).toBeInTheDocument();
      });
    });
  });

  describe("Play All", () => {
    it("shows Play All button with count when unlistened READY items exist", async () => {
      renderHome();

      await waitFor(() => {
        // 2 unlistened READY items in defaultItems (items 1 and 3)
        expect(screen.getByText("Play All (2)")).toBeInTheDocument();
      });
    });

    it("does not show Play All when all items are listened", async () => {
      mockApiFetch.mockResolvedValue({
        items: [
          makeItem("1", { listened: true, status: "READY" }),
          makeItem("2", { listened: true, status: "READY" }),
        ],
      });

      renderHome();

      await waitFor(() => {
        expect(screen.getByText("Episode 1")).toBeInTheDocument();
      });

      expect(screen.queryByText(/Play All/)).not.toBeInTheDocument();
    });
  });

  describe("Chronological ordering", () => {
    it("sorts by request time with youngest first", async () => {
      const olderItem = makeItem("older", {
        createdAt: new Date("2026-03-20T10:00:00Z").toISOString(),
      });
      const newerItem = makeItem("newer", {
        createdAt: new Date("2026-03-21T10:00:00Z").toISOString(),
      });

      // Provide older first in the API response to prove sorting happens
      mockApiFetch.mockResolvedValue({
        items: [olderItem, newerItem],
      });

      renderHome();

      await waitFor(() => {
        expect(screen.getByText("Episode newer")).toBeInTheDocument();
      });

      const allEpisodeTitles = screen.getAllByText(/^Episode /);
      const newerIndex = allEpisodeTitles.findIndex(
        (el) => el.textContent === "Episode newer"
      );
      const olderIndex = allEpisodeTitles.findIndex(
        (el) => el.textContent === "Episode older"
      );

      expect(newerIndex).toBeLessThan(olderIndex);
    });
  });

  describe("Empty filter state", () => {
    it("shows empty message when filter has no matches", async () => {
      // Only subscription items, so On Demand filter should be empty
      mockApiFetch.mockResolvedValue({
        items: [
          makeItem("1", { source: "SUBSCRIPTION", listened: false, status: "READY" }),
        ],
      });

      renderHome();

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText("Episode 1")).toBeInTheDocument();
      });

      // Switch to On Demand filter - this re-fetches, mock returns empty
      mockApiFetch.mockResolvedValue({ items: [] });
      fireEvent.click(screen.getByText("On Demand"));

      await waitFor(() => {
        expect(
          screen.getByText("Nothing here yet.")
        ).toBeInTheDocument();
      });
    });
  });
});
