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
  },
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
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetWidth"
  );

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      value: 300,
    });
  });

  afterAll(() => {
    if (originalOffsetWidth) {
      Object.defineProperty(
        HTMLElement.prototype,
        "offsetWidth",
        originalOffsetWidth
      );
    }
  });

  it("renders the inner FeedItemCard", () => {
    render(
      <MemoryRouter>
        <SwipeableFeedItem
          item={mockItem}
          onToggleListened={vi.fn()}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Test Pod")).toBeInTheDocument();
    expect(screen.getByText("Test Episode")).toBeInTheDocument();
  });

  it("right swipe past 30% threshold calls onToggleListened", () => {
    const onToggleListened = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <SwipeableFeedItem
          item={mockItem}
          onToggleListened={onToggleListened}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    );

    // 30% of 300px = 90px, swipe 100px to be over threshold
    const swipeTarget = container.firstElementChild as HTMLElement;
    simulateSwipe(swipeTarget, 100);

    expect(onToggleListened).toHaveBeenCalledWith("fi-1", true);
  });

  it("right swipe below 30% threshold does NOT call onToggleListened", () => {
    const onToggleListened = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <SwipeableFeedItem
          item={mockItem}
          onToggleListened={onToggleListened}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    );

    // 30% of 300px = 90px, swipe only 50px (below threshold but above SWIPE_THRESHOLD of 10)
    const swipeTarget = container.firstElementChild as HTMLElement;
    simulateSwipe(swipeTarget, 50);

    expect(onToggleListened).not.toHaveBeenCalled();
  });

  it("left swipe past 80% threshold calls onRemove", () => {
    const onRemove = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <SwipeableFeedItem
          item={mockItem}
          onToggleListened={vi.fn()}
          onRemove={onRemove}
        />
      </MemoryRouter>
    );

    // 80% of 300px = 240px, swipe -250px to be over threshold
    const swipeTarget = container.firstElementChild as HTMLElement;
    simulateSwipe(swipeTarget, -250);

    expect(onRemove).toHaveBeenCalledWith("fi-1");
  });

  it("left swipe below 80% threshold does NOT call onRemove", () => {
    const onRemove = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <SwipeableFeedItem
          item={mockItem}
          onToggleListened={vi.fn()}
          onRemove={onRemove}
        />
      </MemoryRouter>
    );

    // 80% of 300px = 240px, swipe only -150px (below threshold)
    const swipeTarget = container.firstElementChild as HTMLElement;
    simulateSwipe(swipeTarget, -150);

    expect(onRemove).not.toHaveBeenCalled();
  });

  it("vertical movement does not trigger swipe (scrolling works)", () => {
    const onToggleListened = vi.fn();
    const onRemove = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <SwipeableFeedItem
          item={mockItem}
          onToggleListened={onToggleListened}
          onRemove={onRemove}
        />
      </MemoryRouter>
    );

    const swipeTarget = container.firstElementChild as HTMLElement;
    // Vertical movement greater than horizontal — should be treated as scroll
    simulateSwipe(swipeTarget, 20, 100);

    expect(onToggleListened).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("after remove is called, component renders collapsed div", () => {
    const onRemove = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <SwipeableFeedItem
          item={mockItem}
          onToggleListened={vi.fn()}
          onRemove={onRemove}
        />
      </MemoryRouter>
    );

    const swipeTarget = container.firstElementChild as HTMLElement;
    simulateSwipe(swipeTarget, -250);

    expect(onRemove).toHaveBeenCalled();

    // After removing, the component should render a collapsed div
    const collapsed = container.firstElementChild as HTMLElement;
    expect(collapsed.style.maxHeight).toBe("0px");
    expect(collapsed.style.opacity).toBe("0");
  });

  it("right swipe on listened item calls onToggleListened with false", () => {
    const onToggleListened = vi.fn();
    const listenedItem: FeedItem = { ...mockItem, listened: true };

    const { container } = render(
      <MemoryRouter>
        <SwipeableFeedItem
          item={listenedItem}
          onToggleListened={onToggleListened}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    );

    const swipeTarget = container.firstElementChild as HTMLElement;
    simulateSwipe(swipeTarget, 100);

    // !listened => !true => false
    expect(onToggleListened).toHaveBeenCalledWith("fi-1", false);
  });
});
