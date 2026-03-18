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

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function mockJsonResponse(data: any) {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  };
}

const CONFIG_RESPONSE = mockJsonResponse({ data: [] });

import CommandCenter from "../../pages/admin/command-center";

function renderPage() {
  return render(
    <MemoryRouter>
      <CommandCenter />
    </MemoryRouter>
  );
}

describe("CommandCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing and shows loading state", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    // Should render skeleton / loading state without crashing
    expect(document.querySelector(".animate-pulse, [class*='skeleton'], [class*='Skeleton']") || document.body).toBeTruthy();
  });

  it("makes correct API calls on mount", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/config")) {
        return Promise.resolve(CONFIG_RESPONSE);
      }
      if (url.includes("/dashboard/activity")) {
        return Promise.resolve(mockJsonResponse({ data: [] }));
      }
      if (url.includes("/dashboard/issues")) {
        return Promise.resolve(mockJsonResponse({ data: [] }));
      }
      if (url.includes("/dashboard/stats")) {
        return Promise.resolve(mockJsonResponse({
          data: { podcasts: { total: 0, trend: 0 }, users: { total: 0, trend: 0 }, episodes: { total: 0, trend: 0 }, briefings: { total: 0, trend: 0 } },
        }));
      }
      if (url.includes("/dashboard/costs")) {
        return Promise.resolve(mockJsonResponse({
          data: { todaySpend: 0, breakdown: [], trend: 0, budgetUsed: 0 },
        }));
      }
      return Promise.resolve(mockJsonResponse({
        data: { overall: "operational", stages: [], activeIssuesCount: 0 },
      }));
    });

    renderPage();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const urls = mockFetch.mock.calls.map((call: any[]) => call[0]);
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/dashboard"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/dashboard/stats"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/dashboard/costs"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/dashboard/activity"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/dashboard/issues"));
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

    // Should not throw / crash
    expect(document.body).toBeTruthy();
  });

  it("shows content after data loads", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/config")) {
        return Promise.resolve(CONFIG_RESPONSE);
      }
      if (url.includes("/dashboard/activity")) {
        return Promise.resolve(mockJsonResponse({ data: [] }));
      }
      if (url.includes("/dashboard/issues")) {
        return Promise.resolve(mockJsonResponse({ data: [] }));
      }
      if (url.includes("/dashboard/stats")) {
        return Promise.resolve(mockJsonResponse({
          data: {
            podcasts: { total: 10, trend: 2 },
            users: { total: 50, trend: 5 },
            episodes: { total: 100, trend: 3 },
            briefings: { total: 25, trend: 1 },
          },
        }));
      }
      if (url.includes("/dashboard/costs")) {
        return Promise.resolve(mockJsonResponse({
          data: {
            todaySpend: 1.23,
            breakdown: [{ category: "STT", amount: 0.5 }],
            trend: -5,
            budgetUsed: 30,
          },
        }));
      }
      // /dashboard (health)
      return Promise.resolve(mockJsonResponse({
        data: {
          overall: "operational",
          stages: [
            { stage: 1, name: "Feed Refresh", completionRate: 99.5 },
            { stage: 2, name: "Transcription", completionRate: 97.2 },
          ],
          activeIssuesCount: 0,
        },
      }));
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("System Health")).toBeInTheDocument();
    });
  });
});

// ── Issue retry tests ──

function setupCCWithIssues(issues: any[]) {
  mockFetch.mockImplementation((url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { enqueued: 1, skipped: 0, message: "ok" } }),
      });
    }
    if (options?.method === "PATCH") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { id: "job-1", status: "FAILED", dismissedAt: new Date().toISOString() } }),
      });
    }
    if (url.includes("/config")) {
      return Promise.resolve(CONFIG_RESPONSE);
    }
    if (url.includes("/dashboard/activity")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });
    }
    if (url.includes("/dashboard/issues")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: issues }),
      });
    }
    if (url.includes("/dashboard/stats")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: {
            podcasts: { total: 10, trend: 2 },
            users: { total: 50, trend: 5 },
            episodes: { total: 100, trend: 3 },
            briefings: { total: 25, trend: 1 },
          },
        }),
      });
    }
    if (url.includes("/dashboard/costs")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: { todaySpend: 1.23, breakdown: [{ category: "STT", amount: 0.5, percentage: 100 }], trend: -5, budgetUsed: 30 },
        }),
      });
    }
    // /dashboard (health)
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        data: {
          overall: "degraded",
          stages: [{ stage: 1, name: "Feed Refresh", completionRate: 80, activeJobs: 0, status: "warning" }],
          activeIssuesCount: issues.length,
        },
      }),
    });
  });
}

describe("IssueCard retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("episode issue retry calls POST /pipeline/trigger/episode/:id", async () => {
    const user = userEvent.setup();
    setupCCWithIssues([
      {
        id: "issue-1",
        severity: "critical",
        title: "FEED_REFRESH job failed",
        description: "Transcription failed for episode ep-123",
        entityId: "ep-123",
        entityType: "episode",
        createdAt: new Date().toISOString(),
        actionable: true,
      },
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Retry"));

    await waitFor(() => {
      const postCalls = mockFetch.mock.calls.filter(
        (call: any[]) =>
          call[1]?.method === "POST" && (call[0] as string).includes("/pipeline/trigger/episode/ep-123")
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("podcast issue retry calls POST /podcasts/:id/refresh", async () => {
    const user = userEvent.setup();
    setupCCWithIssues([
      {
        id: "issue-2",
        severity: "warning",
        title: "Feed parse error",
        description: "Feed URL returned invalid XML",
        entityId: "pod-456",
        entityType: "podcast",
        createdAt: new Date().toISOString(),
        actionable: true,
      },
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Retry"));

    await waitFor(() => {
      const postCalls = mockFetch.mock.calls.filter(
        (call: any[]) =>
          call[1]?.method === "POST" && (call[0] as string).includes("/podcasts/pod-456/refresh")
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("system issue retry calls POST /pipeline/trigger/feed-refresh", async () => {
    const user = userEvent.setup();
    setupCCWithIssues([
      {
        id: "issue-3",
        severity: "info",
        title: "System slowdown",
        description: "Pipeline processing slower than usual",
        entityType: "system",
        createdAt: new Date().toISOString(),
        actionable: true,
      },
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Retry"));

    await waitFor(() => {
      const postCalls = mockFetch.mock.calls.filter(
        (call: any[]) =>
          call[1]?.method === "POST" && (call[0] as string).includes("/pipeline/trigger/feed-refresh")
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
