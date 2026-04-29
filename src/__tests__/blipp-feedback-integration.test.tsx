import { render, screen, fireEvent } from "@testing-library/react";
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
    playbackPhase: "none",
    seek: vi.fn(),
    setRate: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock("../lib/api-client", () => ({
  useApiFetch: () => vi.fn().mockResolvedValue({ id: "bf1" }),
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
    audioUrl: "https://example.com/episode.mp3",
  },
  episodeVote: 0,
  briefing: {
    id: "b1",
    clip: {
      audioUrl: "/audio.mp3",
      actualSeconds: 185,
      previewText: "This is a preview",
    },
    adAudioUrl: null,
  },
};

describe("FeedItemCard -> BlippFeedbackSheet integration", () => {
  it("opens feedback sheet when thumbs-down is clicked", async () => {
    const onEpisodeVote = vi.fn();

    render(
      <MemoryRouter>
        <FeedItemCard
          item={mockItem}
          onEpisodeVote={onEpisodeVote}
        />
      </MemoryRouter>
    );

    // Find and click the thumbs-down button
    const thumbsDownBtn = screen.getByLabelText("Thumbs down");
    fireEvent.click(thumbsDownBtn);

    // Vote callback fires
    expect(onEpisodeVote).toHaveBeenCalledWith("e1", -1);

    // Feedback sheet should now be visible
    expect(screen.getByText("What could be better?")).toBeInTheDocument();
    expect(screen.getByText("Blipp failed")).toBeInTheDocument();
  });
});
