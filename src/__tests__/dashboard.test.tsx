import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "../pages/dashboard";

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

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    // Never resolve the fetch so we stay in loading state
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByTestId("loading")).toHaveTextContent("Loading...");
  });

  it('shows "Generate Briefing" when no briefing exists', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: () => Promise.resolve({ error: "Not Found" }),
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Generate Briefing")).toBeInTheDocument();
    });
  });

  it("shows player when briefing is COMPLETED", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "b1",
          status: "COMPLETED",
          audioUrl: "https://example.com/audio.mp3",
          title: "Today's Briefing",
          segments: [
            { podcastTitle: "Pod A", transitionText: "First up" },
          ],
        }),
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Today's Briefing")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("generates briefing on button click", async () => {
    const user = userEvent.setup();

    // First call: no briefing. Second call: generation result
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve({ error: "Not Found" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "b1",
            status: "PROCESSING",
          }),
      });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Generate Briefing")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Generate Briefing"));
    await waitFor(() => {
      expect(screen.getByText("Your briefing is being generated...")).toBeInTheDocument();
    });
  });
});
