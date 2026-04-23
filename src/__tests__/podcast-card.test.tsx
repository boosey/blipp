import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockOpen = vi.fn();
vi.mock("../contexts/podcast-sheet-context", () => ({
  usePodcastSheet: () => ({ podcastId: null, open: mockOpen, close: vi.fn() }),
}));

vi.mock("../lib/api-client", () => ({
  useApiFetch: () => vi.fn().mockResolvedValue({ podcast: { userVote: 0 }, data: [] }),
}));

import { PodcastCard } from "../components/podcast-card";

const defaultProps = {
  id: "p1",
  title: "Tech Today",
  author: "Jane Doe",
  description: "Daily tech news and analysis.",
  imageUrl: "https://example.com/image.jpg",
};

describe("PodcastCard", () => {
  beforeEach(() => {
    mockOpen.mockClear();
  });

  it("renders title, author, and description", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} />
      </MemoryRouter>
    );
    expect(screen.getByText("Tech Today")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Daily tech news and analysis.")).toBeInTheDocument();
  });

  it("opens podcast sheet on click", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Tech Today"));
    expect(mockOpen).toHaveBeenCalledWith("p1");
  });

  it("renders thumb buttons", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} />
      </MemoryRouter>
    );
    expect(screen.getByLabelText("Thumbs up")).toBeInTheDocument();
    expect(screen.getByLabelText("Thumbs down")).toBeInTheDocument();
  });

  it("shows initial letter when no imageUrl", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} imageUrl="" />
      </MemoryRouter>
    );
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  it("renders episode count when provided", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} episodeCount={42} />
      </MemoryRouter>
    );
    expect(screen.getByText("42 episodes")).toBeInTheDocument();
  });

  it("does not render episode count when not provided", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} />
      </MemoryRouter>
    );
    expect(screen.queryByText(/episodes/)).not.toBeInTheDocument();
  });
});
