import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../contexts/plan-context", () => ({
  usePlan: () => ({
    maxDurationMinutes: 15,
    subscriptions: { limit: 10, remaining: 7, used: 3 },
    briefings: { limit: 100, remaining: 95, used: 5 },
  }),
}));

vi.mock("../components/upgrade-prompt", () => ({
  useUpgradeModal: () => ({
    showUpgrade: vi.fn(),
    UpgradeModalElement: null,
  }),
}));

import { SubscriptionManageSheet } from "../components/subscription-manage-sheet";

const mockSub = {
  id: "sub-1",
  podcastId: "pod-1",
  durationTier: 5,
  podcast: {
    id: "pod-1",
    title: "Test Podcast",
    imageUrl: "https://example.com/img.jpg",
    author: "Test Author",
  },
};

describe("SubscriptionManageSheet", () => {
  it("renders podcast info when open", () => {
    render(
      <MemoryRouter>
        <SubscriptionManageSheet
          subscription={mockSub}
          open={true}
          onOpenChange={vi.fn()}
          onTierChange={vi.fn()}
          onUnsubscribe={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Test Podcast")).toBeInTheDocument();
    expect(screen.getByText("Test Author")).toBeInTheDocument();
  });

  it("renders tier picker buttons", () => {
    render(
      <MemoryRouter>
        <SubscriptionManageSheet
          subscription={mockSub}
          open={true}
          onOpenChange={vi.fn()}
          onTierChange={vi.fn()}
          onUnsubscribe={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("2m")).toBeInTheDocument();
    expect(screen.getByText("5m")).toBeInTheDocument();
    expect(screen.getByText("10m")).toBeInTheDocument();
    expect(screen.getByText("15m")).toBeInTheDocument();
    expect(screen.getByText("30m")).toBeInTheDocument();
  });

  it("renders unsubscribe button", () => {
    render(
      <MemoryRouter>
        <SubscriptionManageSheet
          subscription={mockSub}
          open={true}
          onOpenChange={vi.fn()}
          onTierChange={vi.fn()}
          onUnsubscribe={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Unsubscribe")).toBeInTheDocument();
  });

  it("calls onTierChange when tier is selected", () => {
    const onTierChange = vi.fn();
    render(
      <MemoryRouter>
        <SubscriptionManageSheet
          subscription={mockSub}
          open={true}
          onOpenChange={vi.fn()}
          onTierChange={onTierChange}
          onUnsubscribe={vi.fn()}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("10m"));
    expect(onTierChange).toHaveBeenCalledWith("pod-1", 10);
  });

  it("calls onUnsubscribe when unsubscribe is clicked", () => {
    const onUnsubscribe = vi.fn();
    render(
      <MemoryRouter>
        <SubscriptionManageSheet
          subscription={mockSub}
          open={true}
          onOpenChange={vi.fn()}
          onTierChange={vi.fn()}
          onUnsubscribe={onUnsubscribe}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Unsubscribe"));
    expect(onUnsubscribe).toHaveBeenCalledWith("pod-1");
  });

  it("renders nothing meaningful when subscription is null", () => {
    const { container } = render(
      <MemoryRouter>
        <SubscriptionManageSheet
          subscription={null}
          open={true}
          onOpenChange={vi.fn()}
          onTierChange={vi.fn()}
          onUnsubscribe={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText("Test Podcast")).not.toBeInTheDocument();
    expect(screen.queryByText("Unsubscribe")).not.toBeInTheDocument();
    // Component returns null when subscription is null
    expect(container.innerHTML).toBe("");
  });
});
