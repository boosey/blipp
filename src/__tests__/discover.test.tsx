import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Discover } from "../pages/discover";

vi.mock("@clerk/react", () => ({
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
};

describe("Discover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: subscriptions returns empty
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
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

    // First call: subscriptions, second: search
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([mockPodcast]),
      });

    renderDiscover();

    const input = screen.getByPlaceholderText("Search podcasts...");
    await user.type(input, "tech");
    await user.click(screen.getByText("Search"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/podcasts/search?q=tech",
        expect.any(Object)
      );
    });
  });

  it("renders search results", async () => {
    const user = userEvent.setup();

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([mockPodcast]),
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
