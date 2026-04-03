import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { FeedItem } from "../types/feed";

vi.mock("../lib/api", () => ({
  useApiFetch: () => vi.fn().mockResolvedValue({}),
}));

vi.mock("../contexts/audio-context", () => ({
  useAudio: () => ({
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    currentItem: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    isLoading: false,
    error: null,
    adState: "none",
    isAdPlaying: false,
    adProgress: 0,
    adDuration: 0,
    adCurrentTime: 0,
    seek: vi.fn(),
    setRate: vi.fn(),
    stop: vi.fn(),
  }),
}));

import { FeedItemCard } from "../components/feed-item";

const mockItem: FeedItem = {
  id: "fi-1",
  requestId: null,
  source: "SUBSCRIPTION",
  status: "READY",
  listened: false,
  listenedAt: null,
  playbackPositionSeconds: null,
  durationTier: 5,
  createdAt: "2026-03-16T00:00:00Z",
  errorMessage: null,
  podcast: { id: "p1", title: "Test Pod", imageUrl: null, podcastIndexId: null },
  episode: {
    id: "e1",
    title: "Test Episode",
    publishedAt: "2026-03-16T00:00:00Z",
    durationSeconds: 3600,
  },
  episodeVote: 0,
  briefing: {
    id: "b1",
    clip: {
      audioUrl: "/audio.mp3",
      actualSeconds: 185,
      previewText: "This is a preview of the briefing content",
    },
    adAudioUrl: null,
  },
};

describe("FeedItemCard", () => {
  // --- Duration display ---

  it("shows M:SS format when actualSeconds is available", () => {
    render(
      <MemoryRouter>
        <FeedItemCard item={mockItem} />
      </MemoryRouter>
    );
    // 185 seconds = 3:05
    expect(screen.getByText(/3:05/)).toBeInTheDocument();
  });

  it("shows tier-based format when no actualSeconds", () => {
    const item: FeedItem = {
      ...mockItem,
      briefing: {
        ...mockItem.briefing!,
        clip: { audioUrl: "/audio.mp3", actualSeconds: null, previewText: null },
      },
    };
    render(
      <MemoryRouter>
        <FeedItemCard item={item} />
      </MemoryRouter>
    );
    expect(screen.getByText(/5m/)).toBeInTheDocument();
  });

  // --- Existing behavior (regression) ---

  it("renders podcast title and episode title", () => {
    render(
      <MemoryRouter>
        <FeedItemCard item={mockItem} />
      </MemoryRouter>
    );
    expect(screen.getByText("Test Pod")).toBeInTheDocument();
    expect(screen.getByText("Test Episode")).toBeInTheDocument();
  });

  it("shows creating sweep glow for PENDING items", () => {
    const item: FeedItem = {
      ...mockItem,
      status: "PENDING",
      briefing: null,
    };
    const { container } = render(
      <MemoryRouter>
        <FeedItemCard item={item} />
      </MemoryRouter>
    );
    // Sweep glow wrapper has py-[3px] class
    expect(container.querySelector(".py-\\[3px\\]")).toBeInTheDocument();
  });

  it("shows error message for FAILED items", () => {
    const item: FeedItem = {
      ...mockItem,
      status: "FAILED",
      errorMessage: "audio fetch failed",
      briefing: null,
    };
    render(
      <MemoryRouter>
        <FeedItemCard item={item} />
      </MemoryRouter>
    );
    expect(screen.getByText("Episode audio unavailable")).toBeInTheDocument();
  });

  it("is clickable when READY with clip", () => {
    render(
      <MemoryRouter>
        <FeedItemCard item={mockItem} />
      </MemoryRouter>
    );
    // Play wrapper + share button
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("is not clickable when PENDING", () => {
    const item: FeedItem = {
      ...mockItem,
      status: "PENDING",
      briefing: null,
    };
    render(
      <MemoryRouter>
        <FeedItemCard item={item} />
      </MemoryRouter>
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // --- Cancel feature ---

  it("shows cancel button for PENDING items when onCancel provided", () => {
    const item: FeedItem = {
      ...mockItem,
      status: "PENDING",
      briefing: null,
    };
    render(
      <MemoryRouter>
        <FeedItemCard item={item} onCancel={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByLabelText("Cancel briefing")).toBeInTheDocument();
  });

  it("shows cancel button for PROCESSING items when onCancel provided", () => {
    const item: FeedItem = {
      ...mockItem,
      status: "PROCESSING",
      briefing: null,
    };
    render(
      <MemoryRouter>
        <FeedItemCard item={item} onCancel={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByLabelText("Cancel briefing")).toBeInTheDocument();
  });

  it("does not show cancel button for READY items", () => {
    render(
      <MemoryRouter>
        <FeedItemCard item={mockItem} onCancel={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText("Cancel briefing")).not.toBeInTheDocument();
  });

  it("does not show cancel button when onCancel not provided", () => {
    const item: FeedItem = {
      ...mockItem,
      status: "PENDING",
      briefing: null,
    };
    render(
      <MemoryRouter>
        <FeedItemCard item={item} />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText("Cancel briefing")).not.toBeInTheDocument();
  });

  it("shows Cancelled badge for CANCELLED items", () => {
    const item: FeedItem = {
      ...mockItem,
      status: "CANCELLED" as any,
      briefing: null,
    };
    render(
      <MemoryRouter>
        <FeedItemCard item={item} />
      </MemoryRouter>
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
});
