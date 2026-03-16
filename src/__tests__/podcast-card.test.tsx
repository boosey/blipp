import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PodcastCard } from "../components/podcast-card";

const defaultProps = {
  id: "p1",
  title: "Tech Today",
  author: "Jane Doe",
  description: "Daily tech news and analysis.",
  imageUrl: "https://example.com/image.jpg",
};

describe("PodcastCard", () => {
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

  it("links to podcast detail page", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} />
      </MemoryRouter>
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/discover/p1");
  });

  it("renders chevron icon", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} />
      </MemoryRouter>
    );
    // ChevronRight renders as an SVG inside the link
    const link = screen.getByRole("link");
    const svg = link.querySelector("svg");
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
});
