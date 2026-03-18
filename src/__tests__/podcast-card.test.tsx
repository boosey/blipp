import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PodcastCard } from "../components/podcast-card";

const mockOpen = vi.fn();
vi.mock("../contexts/podcast-sheet-context", () => ({
  usePodcastSheet: () => ({ podcastId: null, open: mockOpen, close: vi.fn() }),
}));

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
    fireEvent.click(screen.getByRole("button"));
    expect(mockOpen).toHaveBeenCalledWith("p1");
  });

  it("renders chevron icon", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} />
      </MemoryRouter>
    );
    const button = screen.getByRole("button");
    const svg = button.querySelector("svg");
    expect(svg).toBeInTheDocument();
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
