import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  useApiFetch: () => vi.fn().mockResolvedValue({ vote: 0 }),
}));

import { toast } from "sonner";

const mockCurrentItem = {
  id: "fi-1",
  source: "SUBSCRIPTION",
  status: "READY",
  listened: false,
  listenedAt: null,
  durationTier: 5,
  createdAt: "2026-03-16T00:00:00Z",
  errorMessage: null,
  podcast: { id: "p1", title: "Test Podcast", imageUrl: null },
  episode: {
    id: "e1",
    title: "Test Episode",
    publishedAt: "2026-03-16T00:00:00Z",
    durationSeconds: 3600,
  },
  briefing: {
    id: "b1",
    clip: { audioUrl: "/audio.mp3", actualSeconds: 185, previewText: null },
    adAudioUrl: null,
  },
};

vi.mock("../contexts/audio-context", () => ({
  useAudio: () => ({
    currentItem: mockCurrentItem,
    isPlaying: false,
    currentTime: 0,
    duration: 185,
    playbackRate: 1,
    pause: vi.fn(),
    resume: vi.fn(),
    seek: vi.fn(),
    setRate: vi.fn(),
    adState: "none",
    adProgress: 0,
    adDuration: 0,
    adCurrentTime: 0,
  }),
}));

import { PlayerSheet } from "../components/player-sheet";

describe("PlayerSheet share functionality", () => {
  it("renders share button when not in ad", () => {
    render(
      <MemoryRouter>
        <PlayerSheet open={true} onOpenChange={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("Share briefing")).toBeInTheDocument();
  });

  it("uses clipboard fallback when navigator.share is not available", async () => {
    // Ensure navigator.share is not available
    const originalShare = navigator.share;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
      writable: true,
    });

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
      writable: true,
    });

    render(
      <MemoryRouter>
        <PlayerSheet open={true} onOpenChange={vi.fn()} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText("Share briefing"));

    // Wait for async clipboard operation
    await vi.waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
    });

    expect(toast).toHaveBeenCalledWith("Link copied to clipboard");

    // Restore
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: originalShare,
      writable: true,
    });
  });

  it("shows formatDuration output in briefing info", () => {
    render(
      <MemoryRouter>
        <PlayerSheet open={true} onOpenChange={vi.fn()} />
      </MemoryRouter>
    );

    // actualSeconds=185 → 3:05 via formatDuration
    expect(screen.getByText("3:05 briefing")).toBeInTheDocument();
  });
});
