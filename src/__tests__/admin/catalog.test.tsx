import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

import Catalog from "../../pages/admin/catalog";

function renderPage() {
  return render(
    <MemoryRouter>
      <Catalog />
    </MemoryRouter>
  );
}

describe("Catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(document.body).toBeTruthy();
  });

  it("makes correct API calls on mount", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/podcasts/stats")) {
        return Promise.resolve(mockJsonResponse({
          data: { total: 0, byHealth: { excellent: 0, good: 0, fair: 0, poor: 0, broken: 0 }, byStatus: { active: 0, paused: 0, archived: 0 } },
        }));
      }
      return Promise.resolve(mockJsonResponse({ data: [] }));
    });

    renderPage();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const urls = mockFetch.mock.calls.map((call: any[]) => call[0]);
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/podcasts?"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/podcasts/stats"));
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
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/podcasts/stats")) {
        return Promise.resolve(mockJsonResponse({
          data: {
            total: 1,
            byHealth: { excellent: 1, good: 0, fair: 0, poor: 0, broken: 0 },
            byStatus: { active: 1, paused: 0, archived: 0 },
          },
        }));
      }
      // /podcasts?...
      return Promise.resolve(mockJsonResponse({
        data: [
          {
            id: "p1",
            title: "Test Podcast",
            author: "Author",
            feedUrl: "https://example.com/feed.xml",
            imageUrl: null,
            feedHealth: "excellent",
            status: "active",
            episodeCount: 10,
            subscriberCount: 5,
            lastFetchedAt: new Date().toISOString(),
          },
        ],
      }));
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Podcast")).toBeInTheDocument();
    });
  });

  it("detail panel Refresh calls POST /podcasts/:id/refresh on click", async () => {
    const user = userEvent.setup();

    // Use a stable getToken mock to prevent re-render loops
    const stableGetToken = vi.fn().mockResolvedValue("test-token");
    const useAuth = await import("@clerk/clerk-react").then((m) => m.useAuth) as ReturnType<typeof vi.fn>;
    useAuth.mockReturnValue({ getToken: stableGetToken });

    const podcastDetail = {
      id: "p1",
      title: "Test Podcast",
      author: "Author",
      feedUrl: "https://example.com/feed.xml",
      imageUrl: null,
      feedHealth: "excellent",
      status: "active",
      episodeCount: 10,
      subscriberCount: 5,
      lastFetchedAt: new Date().toISOString(),
      categories: [],
      description: "A test podcast",
      episodes: [],
      recentPipelineActivity: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        return Promise.resolve(mockJsonResponse({ ok: true }));
      }
      if (url.includes("/podcasts/stats")) {
        return Promise.resolve(mockJsonResponse({
          data: {
            total: 1,
            byHealth: { excellent: 1, good: 0, fair: 0, poor: 0, broken: 0 },
            byStatus: { active: 1, paused: 0, archived: 0 },
            needsAttention: 0,
          },
        }));
      }
      // Detail endpoint: /api/admin/podcasts/p1 (no query params)
      if (url.includes("/podcasts/p1")) {
        return Promise.resolve(mockJsonResponse({ data: podcastDetail }));
      }
      // List endpoint: /api/admin/podcasts?...
      return Promise.resolve(mockJsonResponse({
        data: [
          {
            id: "p1",
            title: "Test Podcast",
            author: "Author",
            feedUrl: "https://example.com/feed.xml",
            imageUrl: null,
            feedHealth: "excellent",
            status: "active",
            episodeCount: 10,
            subscriberCount: 5,
            lastFetchedAt: new Date().toISOString(),
            categories: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      }));
    });

    renderPage();

    // Wait for the catalog to load
    await waitFor(() => {
      expect(screen.getByText("Test Podcast")).toBeInTheDocument();
    });

    // Click podcast card to open detail panel
    const podcastCards = screen.getAllByText("Test Podcast");
    await user.click(podcastCards[0]);

    // Wait for detail panel to render by looking for the feed URL (unique to detail)
    await waitFor(() => {
      expect(screen.getByText(/example\.com\/feed\.xml/)).toBeInTheDocument();
    });

    // Find and click the Refresh button in the detail panel footer (not "Refresh Now" from FeedRefreshCard)
    const refreshBtn = screen.getAllByRole("button").find(
      (btn) => btn.textContent === "Refresh" || btn.textContent === "Refreshing..."
    );
    expect(refreshBtn).toBeTruthy();
    await user.click(refreshBtn!);

    // Verify POST /podcasts/p1/refresh was called
    await waitFor(() => {
      const postCalls = mockFetch.mock.calls.filter(
        (call: any[]) =>
          call[1]?.method === "POST" && (call[0] as string).includes("/podcasts/p1/refresh")
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
