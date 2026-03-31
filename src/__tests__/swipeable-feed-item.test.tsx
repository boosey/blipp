import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { FeedItem } from "../types/feed";

const mockAddToQueue = vi.fn();

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
    addToQueue: mockAddToQueue,
    playAll: vi.fn(),
  }),
}));

import { SwipeableFeedItem } from "../components/swipeable-feed-item";

const mockItem: FeedItem = {
  id: "fi-1",
  source: "SUBSCRIPTION",
  status: "READY",
  listened: false,
  listenedAt: null,
  durationTier: 3,
  createdAt: "2026-03-16T00:00:00Z",
  errorMessage: null,
  podcast: { id: "p1", title: "Test Pod", imageUrl: null },
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
    clip: { audioUrl: "/audio.mp3", actualSeconds: 180, previewText: null },
    adAudioUrl: null,
  },
};

/** Simulate a touch swipe gesture on an element. */
function simulateSwipe(
  element: HTMLElement,
  deltaX: number,
  deltaY: number = 0
) {
  fireEvent.touchStart(element, {
    touches: [{ clientX: 100, clientY: 100 }],
  });
  fireEvent.touchMove(element, {
    touches: [{ clientX: 100 + deltaX, clientY: 100 + deltaY }],
  });
  fireEvent.touchEnd(element);
}

describe("SwipeableFeedItem", () => {
  beforeEach(() => {
    mockAddToQueue.mockClear();
  });

  it("renders the inner FeedItemCard", () => {
    render(
      <MemoryRouter>
        <SwipeableFeedItem
          item={mockItem}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Test Pod")).toBeInTheDocument();
    expect(screen.getByText("Test Episode")).toBeInTheDocument();
  });

  it("has accessible remove and queue buttons", () => {
    render(
      <MemoryRouter>
        <SwipeableFeedItem
          item={mockItem}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("Remove from feed")).toBeInTheDocument();
    expect(screen.getByLabelText("Add to queue")).toBeInTheDocument();
  });

  it("clicking remove button calls onRemove", () => {
    const onRemove = vi.fn();
    render(
      <MemoryRouter>
        <SwipeableFeedItem
          item={mockItem}
          onRemove={onRemove}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText("Remove from feed"));
    expect(onRemove).toHaveBeenCalledWith("fi-1");
  });

  it("vertical movement does not trigger swipe (scrolling works)", () => {
    const onRemove = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <SwipeableFeedItem
          item={mockItem}
          onRemove={onRemove}
        />
      </MemoryRouter>
    );

    const swipeTarget = container.firstElementChild as HTMLElement;
    simulateSwipe(swipeTarget, 20, 100);

    expect(onRemove).not.toHaveBeenCalled();
  });

  it("after remove is called, component renders collapsed div", () => {
    const onRemove = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <SwipeableFeedItem
          item={mockItem}
          onRemove={onRemove}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText("Remove from feed"));
    expect(onRemove).toHaveBeenCalled();

    const collapsed = container.firstElementChild as HTMLElement;
    expect(collapsed.style.maxHeight).toBe("0px");
    expect(collapsed.style.opacity).toBe("0");
  });
});
