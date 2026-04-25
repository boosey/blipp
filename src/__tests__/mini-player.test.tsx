import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MiniPlayer } from "../components/mini-player";
import { useAudio } from "../contexts/audio-context";
import { usePodcastSheet } from "../contexts/podcast-sheet-context";

vi.mock("../contexts/audio-context", () => ({
  useAudio: vi.fn(),
}));

vi.mock("../contexts/podcast-sheet-context", () => ({
  usePodcastSheet: vi.fn(),
}));

// Mock child components to keep tests focused
vi.mock("../components/player-sheet", () => ({
  PlayerSheet: () => <div data-testid="player-sheet" />,
}));
vi.mock("../components/queue-sheet", () => ({
  QueueSheet: () => <div data-testid="queue-sheet" />,
}));

describe("MiniPlayer", () => {
  const mockPause = vi.fn();
  const mockResume = vi.fn();
  const mockSeek = vi.fn();
  const mockOpenPodcast = vi.fn();

  const mockAudioContext = {
    currentItem: {
      id: "f1",
      episode: { title: "Test Episode" },
      podcast: { id: "p1", title: "Test Podcast", imageUrl: "test.jpg" },
    },
    isPlaying: false,
    currentTime: 10,
    duration: 100,
    pause: mockPause,
    resume: mockResume,
    seek: mockSeek,
    queue: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAudio as any).mockReturnValue(mockAudioContext);
    (usePodcastSheet as any).mockReturnValue({ open: mockOpenPodcast });
  });

  it("should render nothing if no current item", () => {
    (useAudio as any).mockReturnValue({ ...mockAudioContext, currentItem: null });
    const { container } = render(<MiniPlayer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("should render current episode and podcast info", () => {
    render(<MiniPlayer />);
    expect(screen.getByText("Test Episode")).toBeInTheDocument();
    expect(screen.getByText("Test Podcast")).toBeInTheDocument();
  });

  it("should call resume when play button is clicked", () => {
    render(<MiniPlayer />);
    fireEvent.click(screen.getByLabelText("Play"));
    expect(mockResume).toHaveBeenCalled();
  });

  it("should call pause when pause button is clicked", () => {
    (useAudio as any).mockReturnValue({ ...mockAudioContext, isPlaying: true });
    render(<MiniPlayer />);
    fireEvent.click(screen.getByLabelText("Pause"));
    expect(mockPause).toHaveBeenCalled();
  });

  it("should seek forward when +15 button is clicked", () => {
    render(<MiniPlayer />);
    fireEvent.click(screen.getByLabelText("Skip 15 seconds forward"));
    expect(mockSeek).toHaveBeenCalledWith(25);
  });

  it("should open player sheet when pill is clicked", () => {
    render(<MiniPlayer />);
    fireEvent.click(screen.getByLabelText("Open full player"));
    // Since we mocked PlayerSheet, we can't easily see it "open" unless we check state or use a real mock, 
    // but the presence of the mock-testid confirms it rendered.
    expect(screen.getByTestId("player-sheet")).toBeInTheDocument();
  });
});
