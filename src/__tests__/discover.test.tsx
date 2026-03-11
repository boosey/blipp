import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Discover } from "../pages/discover";

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
    // Default: subscriptions returns empty, catalog returns empty
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

  it("search triggers API call", async () => {
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
    await user.click(screen.getByText("Search"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/podcasts/catalog?q=tech"),
        expect.any(Object)
      );
    });
  });

  it("renders search results", async () => {
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
    await user.click(screen.getByText("Search"));

    await waitFor(() => {
      expect(screen.getByText("Tech Pod")).toBeInTheDocument();
    });
    expect(screen.getByText("Search Results")).toBeInTheDocument();
  });
});
