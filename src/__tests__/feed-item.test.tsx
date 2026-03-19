import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { FeedItem } from "../types/feed";

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
  source: "SUBSCRIPTION",
  status: "READY",
  listened: false,
  listenedAt: null,
  durationTier: 5,
  createdAt: "2026-03-16T00:00:00Z",
  errorMessage: null,
  podcast: { id: "p1", title: "Test Pod", imageUrl: null },
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

  // --- Preview text ---

  it("shows preview text for READY items with previewText", () => {
    render(
      <MemoryRouter>
        <FeedItemCard item={mockItem} />
      </MemoryRouter>
    );
    expect(
      screen.getByText("This is a preview of the briefing content")
    ).toBeInTheDocument();
  });

  it("does not show preview text for non-READY items", () => {
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
    expect(
      screen.queryByText("This is a preview of the briefing content")
    ).not.toBeInTheDocument();
  });

  it("does not show preview text when previewText is null", () => {
    const item: FeedItem = {
      ...mockItem,
      briefing: {
        ...mockItem.briefing!,
        clip: { audioUrl: "/audio.mp3", actualSeconds: 185, previewText: null },
      },
    };
    render(
      <MemoryRouter>
        <FeedItemCard item={item} />
      </MemoryRouter>
    );
    // The preview paragraph should not be rendered
    const paragraphs = document.querySelectorAll("p.line-clamp-2");
    expect(paragraphs).toHaveLength(0);
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

  it("shows status badge for PENDING items", () => {
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
    expect(screen.getByText("Creating")).toBeInTheDocument();
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
    expect(screen.getByRole("button")).toBeInTheDocument();
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
});
