import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlanDetail } from "../components/plan-comparison";

const { mockApiFetch } = vi.hoisted(() => {
  return { mockApiFetch: vi.fn() };
});

vi.mock("@clerk/clerk-react", () => ({
  useAuth: vi.fn(() => ({
    getToken: vi.fn(() => Promise.resolve("token")),
  })),
  ClerkProvider: ({ children }: any) => children,
}));

vi.mock("../lib/api", () => ({
  useApiFetch: () => mockApiFetch,
}));

import { PlanComparison } from "../components/plan-comparison";

const mockPlans: PlanDetail[] = [
  {
    id: "plan-free",
    slug: "free",
    name: "Free",
    description: "Get started",
    priceCentsMonthly: 0,
    priceCentsAnnual: null,
    features: ["5 briefings per week", "3 minute maximum"],
    highlighted: false,
  },
  {
    id: "plan-pro",
    slug: "pro",
    name: "Pro",
    description: "For power listeners",
    priceCentsMonthly: 999,
    priceCentsAnnual: 9990,
    features: ["Unlimited briefings", "15 minute maximum", "Ad-free", "Priority processing"],
    highlighted: true,
  },
];

describe("PlanComparison", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue(mockPlans);
  });

  it("renders loading skeletons initially", () => {
    // Make the fetch hang so we can see loading state
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    render(
      <PlanComparison
        currentPlanSlug="free"
        onUpgrade={vi.fn()}
        onManage={vi.fn()}
        actionLoading={null}
      />
    );

    // Skeleton elements rendered (2 of them based on the code)
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
  });

  it("renders all plans after fetch", async () => {
    render(
      <PlanComparison
        currentPlanSlug="free"
        onUpgrade={vi.fn()}
        onManage={vi.fn()}
        actionLoading={null}
      />
    );

    await waitFor(() => {
      // "Free" appears twice: as the plan name heading and as the price display
      expect(screen.getAllByText("Free")).toHaveLength(2);
      expect(screen.getByText("Pro")).toBeInTheDocument();
    });
  });

  it("marks current plan with 'Current Plan' badge", async () => {
    render(
      <PlanComparison
        currentPlanSlug="free"
        onUpgrade={vi.fn()}
        onManage={vi.fn()}
        actionLoading={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Current Plan")).toBeInTheDocument();
    });
  });

  it("shows upgrade button for non-current paid plans", async () => {
    render(
      <PlanComparison
        currentPlanSlug="free"
        onUpgrade={vi.fn()}
        onManage={vi.fn()}
        actionLoading={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Upgrade to Pro")).toBeInTheDocument();
    });
  });

  it("does not show upgrade button for free plan when it is not current", async () => {
    render(
      <PlanComparison
        currentPlanSlug="pro"
        onUpgrade={vi.fn()}
        onManage={vi.fn()}
        actionLoading={null}
      />
    );

    await waitFor(() => {
      // "Free" appears as plan name and price — use getAllByText
      expect(screen.getAllByText("Free").length).toBeGreaterThanOrEqual(1);
    });

    // Free plan has priceCentsMonthly === 0, so no upgrade button should render
    expect(screen.queryByText("Upgrade to Free")).not.toBeInTheDocument();
  });

  it("calls onUpgrade with correct plan when upgrade clicked", async () => {
    const user = userEvent.setup();
    const onUpgrade = vi.fn();

    render(
      <PlanComparison
        currentPlanSlug="free"
        onUpgrade={onUpgrade}
        onManage={vi.fn()}
        actionLoading={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Upgrade to Pro")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Upgrade to Pro"));

    expect(onUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plan-pro", slug: "pro", name: "Pro" }),
      "monthly"
    );
  });

  it("calls onManage when Manage clicked on current paid plan", async () => {
    const user = userEvent.setup();
    const onManage = vi.fn();

    render(
      <PlanComparison
        currentPlanSlug="pro"
        onUpgrade={vi.fn()}
        onManage={onManage}
        actionLoading={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Manage")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Manage"));

    expect(onManage).toHaveBeenCalled();
  });

  it("shows features from the plan's features array", async () => {
    render(
      <PlanComparison
        currentPlanSlug="free"
        onUpgrade={vi.fn()}
        onManage={vi.fn()}
        actionLoading={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("· 5 briefings per week")).toBeInTheDocument();
      expect(screen.getByText("· 3 minute maximum")).toBeInTheDocument();
      expect(screen.getByText("· Unlimited briefings")).toBeInTheDocument();
      expect(screen.getByText("· Ad-free")).toBeInTheDocument();
      expect(screen.getByText("· Priority processing")).toBeInTheDocument();
    });
  });

  it("shows price for paid plans", async () => {
    render(
      <PlanComparison
        currentPlanSlug="free"
        onUpgrade={vi.fn()}
        onManage={vi.fn()}
        actionLoading={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("$9.99/mo")).toBeInTheDocument();
    });
  });
});
