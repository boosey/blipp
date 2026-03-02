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

import Episodes from "../../pages/admin/episodes";

function renderPage() {
  return render(
    <MemoryRouter>
      <Episodes />
    </MemoryRouter>
  );
}

describe("Episodes", () => {
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
      mockJsonResponse({ data: [] })
    );

    renderPage();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const urls = mockFetch.mock.calls.map((call: any[]) => call[0]);
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/episodes?"));
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
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        data: [
          {
            id: "e1",
            title: "Test Episode",
            podcastId: "p1",
            podcastTitle: "Test Podcast",
            podcastImageUrl: null,
            publishedAt: new Date().toISOString(),
            durationSeconds: 3600,
            pipelineStatus: "completed",
            clipCount: 3,
            cost: 0.05,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Test Episode")).toBeInTheDocument();
    });
  });
});
