import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@clerk/clerk-react", () => ({
  useUser: vi.fn(() => ({ user: { publicMetadata: { tier: "FREE" } } })),
  useAuth: vi.fn(() => ({ getToken: vi.fn().mockResolvedValue("test-token") })),
  SignedIn: ({ children }: any) => children,
  SignedOut: ({ children }: any) => children,
  SignInButton: ({ children }: any) => children,
  UserButton: () => <div data-testid="user-button" />,
  RedirectToSignIn: () => <div data-testid="redirect-sign-in" />,
  ClerkProvider: ({ children }: any) => children,
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function mockJsonResponse(data: any) {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  };
}

import UsersPage from "../../pages/admin/users";

function renderPage() {
  return render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>
  );
}

describe("UsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(document.body).toBeTruthy();
  });

  it("makes correct API calls on mount", async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        data: [],
        total: 0,
        all: 0,
        power_users: 0,
        at_risk: 0,
        trial_ending: 0,
        never_active: 0,
      })
    );

    renderPage();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const urls = mockFetch.mock.calls.map((call: any[]) => call[0]);
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/users/segments"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/users?"));
  });

  it("handles error responses without crashing", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({ error: "Server Error" }),
    });

    renderPage();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(document.body).toBeTruthy();
  });

  it("shows content after data loads", async () => {
    // Segments response + users list response
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        data: [
          {
            id: "u1",
            email: "test@example.com",
            name: "Test User",
            imageUrl: null,
            plan: { id: "plan_free", name: "Free", slug: "free" },
            status: "active",
            briefingCount: 5,
            podcastCount: 3,
            badges: [],
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
          },
        ],
        total: 1,
        all: 1,
        power_users: 0,
        at_risk: 0,
        trial_ending: 0,
        never_active: 0,
      })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Test User")).toBeInTheDocument();
    });
  });
});
