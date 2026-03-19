import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Discover } from "../pages/discover";

const stableGetToken = vi.fn().mockResolvedValue("test-token");

vi.mock("../contexts/podcast-sheet-context", () => ({
  usePodcastSheet: () => ({ podcastId: null, open: vi.fn(), close: vi.fn() }),
}));

vi.mock("@clerk/clerk-react", () => ({
  useUser: vi.fn(() => ({ user: { publicMetadata: { tier: "FREE" } } })),
  useAuth: vi.fn(() => ({ getToken: stableGetToken })),
  SignedIn: ({ children }: any) => children,
  SignedOut: ({ children }: any) => children,
  SignInButton: ({ children }: any) => children,
  UserButton: () => <div data-testid="user-button" />,
  RedirectToSignIn: () => <div data-testid="redirect-sign-in" />,
  ClerkProvider: ({ children }: any) => children,
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function renderDiscover() {
  return render(
    <MemoryRouter>
      <Discover />
    </MemoryRouter>
  );
}

function mockJsonResponse(data: any) {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  };
}

describe("Discover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stableGetToken.mockResolvedValue("test-token");
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/podcasts/categories")) {
        return Promise.resolve(mockJsonResponse({
          categories: [
            { id: "c1", name: "News", podcastCount: 10 },
            { id: "c2", name: "Technology", podcastCount: 5 },
          ],
        }));
      }
      if (url.includes("/recommendations/curated")) {
        return Promise.resolve(mockJsonResponse({ rows: [], podcastSuggestions: [] }));
      }
      if (url.includes("/recommendations/episodes")) {
        return Promise.resolve(mockJsonResponse({ episodes: [], total: 0, page: 1, pageSize: 20 }));
      }
      if (url.includes("/podcasts/catalog")) {
        return Promise.resolve(mockJsonResponse({ podcasts: [], total: 0, page: 1, pageSize: 50 }));
      }
      if (url.includes("/podcasts/requests")) {
        return Promise.resolve(mockJsonResponse({ data: [] }));
      }
      return Promise.resolve(mockJsonResponse({}));
    });
  });

  it("renders search input", async () => {
    renderDiscover();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search episodes & podcasts...")).toBeInTheDocument();
    });
  });

  it("renders category pills", async () => {
    renderDiscover();
    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
      expect(screen.getByText("Technology")).toBeInTheDocument();
      expect(screen.getByText("News")).toBeInTheDocument();
    });
  });

  it("renders Episodes and Podcasts browse tabs", async () => {
    renderDiscover();
    await waitFor(() => {
      expect(screen.getByText("Episodes")).toBeInTheDocument();
      expect(screen.getByText("Podcasts")).toBeInTheDocument();
    });
  });

  it("renders curated rows when API returns them", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/recommendations/curated")) {
        return Promise.resolve(mockJsonResponse({
          rows: [
            {
              title: "Trending Now",
              type: "episodes",
              items: [{
                episode: { id: "e1", title: "AI Episode", publishedAt: new Date().toISOString(), durationSeconds: 300, topicTags: [] },
                podcast: { id: "p1", title: "Tech Pod", author: "Alice", imageUrl: null },
                score: 0.9,
                reasons: ["Trending"],
              }],
            },
          ],
          podcastSuggestions: [],
        }));
      }
      if (url.includes("/podcasts/categories")) {
        return Promise.resolve(mockJsonResponse({ categories: [] }));
      }
      if (url.includes("/recommendations/episodes")) {
        return Promise.resolve(mockJsonResponse({ episodes: [], total: 0, page: 1, pageSize: 20 }));
      }
      if (url.includes("/podcasts/catalog")) {
        return Promise.resolve(mockJsonResponse({ podcasts: [], total: 0, page: 1, pageSize: 50 }));
      }
      if (url.includes("/podcasts/requests")) {
        return Promise.resolve(mockJsonResponse({ data: [] }));
      }
      return Promise.resolve(mockJsonResponse({}));
    });

    renderDiscover();
    await waitFor(() => {
      expect(screen.getByText("Trending Now")).toBeInTheDocument();
      expect(screen.getByText("AI Episode")).toBeInTheDocument();
    });
  });
});
