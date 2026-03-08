import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PodcastCard } from "../components/podcast-card";

// Mock useApiFetch — the component now uses it instead of bare fetch
const mockApiFetch = vi.fn();
vi.mock("../lib/api", () => ({
  useApiFetch: () => mockApiFetch,
}));

const defaultProps = {
  id: "p1",
  title: "Tech Today",
  author: "Jane Doe",
  description: "Daily tech news and analysis.",
  imageUrl: "https://example.com/image.jpg",
  isSubscribed: false,
  onToggle: vi.fn(),
};

describe("PodcastCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({});
  });

  it("renders title and author", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} />
      </MemoryRouter>
    );
    expect(screen.getByText("Tech Today")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows Subscribe button when not subscribed", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} isSubscribed={false} />
      </MemoryRouter>
    );
    expect(screen.getByText("Subscribe")).toBeInTheDocument();
  });

  it("shows Subscribed button when subscribed", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} isSubscribed={true} />
      </MemoryRouter>
    );
    expect(screen.getByText("Subscribed")).toBeInTheDocument();
  });

  it("calls API on subscribe click", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} onToggle={onToggle} />
      </MemoryRouter>
    );

    await user.click(screen.getByText("Subscribe"));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/podcasts/subscribe",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"durationTier":5'),
        })
      );
    });
    expect(onToggle).toHaveBeenCalled();
  });
});
