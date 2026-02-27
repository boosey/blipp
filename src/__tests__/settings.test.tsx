import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Settings } from "../pages/settings";
import { useUser } from "@clerk/clerk-react";

vi.mock("@clerk/clerk-react", () => ({
  useUser: vi.fn(() => ({ user: { publicMetadata: { tier: "FREE" } } })),
  useAuth: vi.fn(() => ({ getToken: vi.fn() })),
  SignedIn: ({ children }: any) => children,
  SignedOut: ({ children }: any) => children,
  SignInButton: ({ children }: any) => children,
  UserButton: () => <div data-testid="user-button" />,
  RedirectToSignIn: () => <div data-testid="redirect-sign-in" />,
  ClerkProvider: ({ children }: any) => children,
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

describe("Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset useUser to FREE tier default
    vi.mocked(useUser).mockReturnValue({
      user: { publicMetadata: { tier: "FREE" } },
    } as any);
    // Default: preferences endpoint returns defaults
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ briefingLength: 5, briefingTime: "07:00" }),
    });
  });

  it("renders briefing length slider", async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole("slider", { name: "Briefing length" })).toBeInTheDocument();
    });
  });

  it("shows upgrade buttons for FREE tier", async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText("Upgrade to Pro")).toBeInTheDocument();
      expect(screen.getByText("Upgrade to Pro+")).toBeInTheDocument();
    });
  });

  it("shows manage button for PRO tier", async () => {
    vi.mocked(useUser).mockReturnValue({
      user: { publicMetadata: { tier: "PRO" } },
    } as any);

    renderSettings();
    await waitFor(() => {
      expect(screen.getByText("Manage Subscription")).toBeInTheDocument();
    });
    expect(screen.queryByText("Upgrade to PRO")).not.toBeInTheDocument();
  });

  it("shows correct max for FREE tier slider", async () => {
    renderSettings();
    await waitFor(() => {
      const slider = screen.getByRole("slider", { name: "Briefing length" });
      expect(slider).toHaveAttribute("max", "5");
    });
  });
});
