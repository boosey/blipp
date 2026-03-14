import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Discover } from "../pages/discover";

const stableGetToken = vi.fn().mockResolvedValue("test-token");

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

const mockPodcast = {
  id: "p1",
  title: "Tech Pod",
  author: "Alice",
  description: "A tech podcast",
  imageUrl: "https://example.com/img.jpg",
  feedUrl: "https://example.com/feed.xml",
  episodeCount: 10,
  categories: ["Technology"],
};

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
      if (url.includes("/podcasts/subscriptions")) {
        return Promise.resolve(mockJsonResponse({ subscriptions: [] }));
      }
      if (url.includes("/podcasts/catalog")) {
        return Promise.resolve(mockJsonResponse({ podcasts: [] }));
      }
      return Promise.resolve(mockJsonResponse({}));
    });
  });

  it("renders search input", async () => {
    renderDiscover();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search podcasts...")).toBeInTheDocument();
    });
  });

  it("renders category pills in browse mode", async () => {
    renderDiscover();
    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
      expect(screen.getByText("Technology")).toBeInTheDocument();
      expect(screen.getByText("News")).toBeInTheDocument();
    });
  });

  it("renders trending and browse sections with catalog data", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/podcasts/subscriptions")) {
        return Promise.resolve(mockJsonResponse({ subscriptions: [] }));
      }
      if (url.includes("/podcasts/catalog")) {
        return Promise.resolve(mockJsonResponse({ podcasts: [mockPodcast] }));
      }
      return Promise.resolve(mockJsonResponse({}));
    });

    renderDiscover();

    await waitFor(() => {
      expect(screen.getByText("Trending Now")).toBeInTheDocument();
      expect(screen.getByText("Browse All")).toBeInTheDocument();
      // Appears in both trending and browse sections
      expect(screen.getAllByText("Tech Pod")).toHaveLength(2);
    });
  });

  it("debounced search triggers API call and shows results", async () => {
    const user = userEvent.setup();

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/podcasts/subscriptions")) {
        return Promise.resolve(mockJsonResponse({ subscriptions: [] }));
      }
      if (url.includes("/podcasts/catalog")) {
        return Promise.resolve(mockJsonResponse({ podcasts: [mockPodcast] }));
      }
      return Promise.resolve(mockJsonResponse({}));
    });

    renderDiscover();

    const input = screen.getByPlaceholderText("Search podcasts...");
    await user.type(input, "tech");

    // Wait for debounce (300ms) + API response
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/podcasts/catalog?q=tech"),
        expect.any(Object)
      );
    }, { timeout: 2000 });

    await waitFor(() => {
      expect(screen.getByText("Search Results")).toBeInTheDocument();
      expect(screen.getByText("Tech Pod")).toBeInTheDocument();
    });
  });
});
