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

});
