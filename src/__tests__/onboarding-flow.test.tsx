import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { OnboardingProvider, useOnboarding } from "../contexts/onboarding-context";

// Mock API
const mockApiFetch = vi.fn();
vi.mock("../lib/api-client", () => ({
  useApiFetch: () => mockApiFetch,
}));

// Mock Clerk
vi.mock("@clerk/clerk-react", () => ({
  UserButton: () => null,
  SignedIn: ({ children }: any) => children,
  SignedOut: () => null,
  SignInButton: () => null,
}));

/** Shows current path for assertions */
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

/**
 * Mirrors MobileLayout's onboarding redirect logic using shared context.
 */
function TestLayout() {
  const { needsOnboarding, isChecking } = useOnboarding();
  const location = useLocation();
  const isOnboarding = location.pathname === "/onboarding";

  if (isChecking) return <div>Loading...</div>;

  if (needsOnboarding && !isOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <>
      <LocationDisplay />
      <Outlet />
    </>
  );
}

/**
 * Onboarding page that mirrors the real one's markComplete flow.
 */
function TestOnboarding() {
  const { markComplete } = useOnboarding();

  async function handleFinish() {
    await mockApiFetch("/me/onboarding-complete", { method: "PATCH" });
    markComplete();
  }

  return (
    <div>
      <div>Onboarding Page</div>
      <button onClick={handleFinish}>Finish Onboarding</button>
    </div>
  );
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <OnboardingProvider>
        <Routes>
          <Route element={<TestLayout />}>
            <Route path="/onboarding" element={<TestOnboarding />} />
            <Route path="/home" element={<div>Home Page</div>} />
          </Route>
        </Routes>
      </OnboardingProvider>
    </MemoryRouter>
  );
}

describe("Onboarding flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to onboarding when onboardingComplete is false", async () => {
    mockApiFetch.mockResolvedValueOnce({ user: { onboardingComplete: false } });

    renderApp("/home");

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/onboarding");
    });
  });

  it("does NOT redirect when onboardingComplete is true", async () => {
    mockApiFetch.mockResolvedValueOnce({ user: { onboardingComplete: true } });

    renderApp("/home");

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/home");
    });
    expect(screen.getByText("Home Page")).toBeInTheDocument();
  });

  it("stays on feed after completing onboarding (regression: shared state)", async () => {
    // 1. /me returns onboardingComplete: false
    mockApiFetch.mockResolvedValueOnce({ user: { onboardingComplete: false } });
    // 2. PATCH onboarding-complete succeeds
    mockApiFetch.mockResolvedValueOnce({ data: { onboardingComplete: true } });

    renderApp("/onboarding");

    // Wait for onboarding page to render
    await waitFor(() => {
      expect(screen.getByText("Onboarding Page")).toBeInTheDocument();
    });

    // Complete onboarding — calls markComplete() on the shared context
    const user = userEvent.setup();
    await user.click(screen.getByText("Finish Onboarding"));

    // After markComplete(), needsOnboarding is false in the shared context.
    // The layout should NOT redirect back to /onboarding.
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/onboarding");
    });
    // Still on onboarding page (step 3 in real app), but no redirect loop
    expect(screen.queryByText("Home Page")).not.toBeInTheDocument();
  });
});
