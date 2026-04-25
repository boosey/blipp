import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueueSheet } from "../components/queue-sheet";
import { useAudio } from "../contexts/audio-context";

vi.mock("../contexts/audio-context", () => ({
  useAudio: vi.fn(),
}));

// Mock Radix UI Sheet component
vi.mock("./ui/sheet", () => ({
  Sheet: ({ children, open }: any) => open ? <div>{children}</div> : null,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h1>{children}</h1>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
}));

describe("QueueSheet", () => {
  const mockRemoveFromQueue = vi.fn();
  const mockClearQueue = vi.fn();
  const mockSkipToQueueItem = vi.fn();
  const mockReorderQueue = vi.fn();

  const mockAudioContext = {
    currentItem: {
      id: "f1",
      episode: { title: "Now Playing Ep" },
      podcast: { id: "p1", title: "Now Playing Pod", imageUrl: "test.jpg" },
    },
    queue: [
      {
        id: "f2",
        episode: { title: "Next Ep 1" },
        podcast: { id: "p2", title: "Next Pod 1" },
      },
      {
        id: "f3",
        episode: { title: "Next Ep 2" },
        podcast: { id: "p3", title: "Next Pod 2" },
      }
    ],
    removeFromQueue: mockRemoveFromQueue,
    clearQueue: mockClearQueue,
    skipToQueueItem: mockSkipToQueueItem,
    reorderQueue: mockReorderQueue,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAudio as any).mockReturnValue(mockAudioContext);
  });

  it("should not render when closed", () => {
    render(<QueueSheet open={false} onOpenChange={() => {}} />);
    expect(screen.queryByText("Queue")).not.toBeInTheDocument();
  });

  it("should render current item and queue list when open", () => {
    render(<QueueSheet open={true} onOpenChange={() => {}} />);
    expect(screen.getByText("Now Playing Ep")).toBeInTheDocument();
    expect(screen.getByText("Next Ep 1")).toBeInTheDocument();
    expect(screen.getByText("Next Ep 2")).toBeInTheDocument();
  });

  it("should call clearQueue when 'Clear all' is clicked", () => {
    render(<QueueSheet open={true} onOpenChange={() => {}} />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(mockClearQueue).toHaveBeenCalled();
  });

  it("should call removeFromQueue when remove button is clicked", () => {
    render(<QueueSheet open={true} onOpenChange={() => {}} />);
    const removeButtons = screen.getAllByLabelText(/Remove .* from queue/);
    fireEvent.click(removeButtons[0]);
    expect(mockRemoveFromQueue).toHaveBeenCalledWith("f2");
  });

  it("should call skipToQueueItem when an item is clicked to play", () => {
    render(<QueueSheet open={true} onOpenChange={() => {}} />);
    fireEvent.click(screen.getByLabelText("Play Next Ep 1"));
    expect(mockSkipToQueueItem).toHaveBeenCalledWith("f2");
  });

  it("should call reorderQueue when moving an item down", () => {
    render(<QueueSheet open={true} onOpenChange={() => {}} />);
    const moveDownButtons = screen.getAllByLabelText("Move down");
    fireEvent.click(moveDownButtons[0]);
    expect(mockReorderQueue).toHaveBeenCalledWith(0, 1);
  });
});
