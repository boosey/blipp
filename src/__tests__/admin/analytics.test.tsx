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

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="chart-container">{children}</div>,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => null,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function mockJsonResponse(data: any) {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  };
}

import Analytics from "../../pages/admin/analytics";

function renderPage() {
  return render(
    <MemoryRouter>
      <Analytics />
    </MemoryRouter>
  );
}

describe("Analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders without crashing", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(document.body).toBeTruthy();
  });

  it("makes correct API calls on mount", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/analytics/costs/by-model")) {
        return Promise.resolve(mockJsonResponse({
          data: { models: [], byStage: [] },
        }));
      }
      if (url.includes("/analytics/costs")) {
        return Promise.resolve(mockJsonResponse({
          data: { totalCost: 0, dailyCosts: [], comparison: { amount: 0, direction: "down", percentage: 0 }, metrics: { perEpisode: 0, dailyAvg: 0, projectedMonthly: 0, budgetStatus: "OK" }, efficiencyScore: 85 },
        }));
      }
      if (url.includes("/analytics/usage")) {
        return Promise.resolve(mockJsonResponse({
          data: { trends: [], metrics: { feedItems: 0, episodes: 0, users: 0, avgDuration: 0 }, byPlan: [], peakTimes: [], topPodcasts: [] },
        }));
      }
      if (url.includes("/analytics/quality")) {
        return Promise.resolve(mockJsonResponse({
          data: { overallScore: 90, components: { timeFitting: 95, claimCoverage: 90, transcription: 92, userSatisfaction: 88 }, trend: [], recentIssues: [] },
        }));
      }
      return Promise.resolve(mockJsonResponse({
        data: { throughput: { episodesPerHour: 0, trend: 0 }, successRates: [], processingSpeed: [], bottlenecks: [] },
      }));
    });

    renderPage();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const urls = mockFetch.mock.calls.map((call: any[]) => call[0]);
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/analytics/costs?"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/analytics/usage?"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/analytics/quality?"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/analytics/pipeline?"));
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
      if (url.includes("/analytics/costs/by-model")) {
        return Promise.resolve(mockJsonResponse({
          data: {
            models: [],
            byStage: [],
          },
        }));
      }
      if (url.includes("/analytics/costs")) {
        return Promise.resolve(mockJsonResponse({
          data: {
            totalCost: 42.50,
            dailyCosts: [{ date: "2026-03-01", stt: 1, distillation: 2, tts: 1.5, infrastructure: 0.5 }],
            comparison: { amount: 4.25, direction: "down", percentage: 10 },
            metrics: { perEpisode: 0.05, dailyAvg: 1.42, projectedMonthly: 42.5, budgetStatus: "OK" },
            efficiencyScore: 85,
          },
        }));
      }
      if (url.includes("/analytics/usage")) {
        return Promise.resolve(mockJsonResponse({
          data: {
            trends: [{ date: "2026-03-01", feedItems: 10, episodes: 20, users: 5 }],
            metrics: { feedItems: 100, episodes: 200, users: 50, avgDuration: 300 },
            byPlan: [{ plan: "FREE", count: 30, percentage: 60 }],
            peakTimes: [{ hour: 8, count: 15 }],
            topPodcasts: [],
          },
        }));
      }
      if (url.includes("/analytics/quality")) {
        return Promise.resolve(mockJsonResponse({
          data: {
            overallScore: 90,
            components: { timeFitting: 95, claimCoverage: 90, transcription: 92, userSatisfaction: 88 },
            trend: [{ date: "2026-03-01", score: 90 }],
            recentIssues: [],
          },
        }));
      }
      // /analytics/pipeline
      return Promise.resolve(mockJsonResponse({
        data: {
          throughput: { episodesPerHour: 10, trend: 5 },
          successRates: [{ stage: 1, name: "Feed Refresh", rate: 99 }],
          processingSpeed: [{ date: "2026-03-01", avgMs: 500 }],
          bottlenecks: [],
        },
      }));
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Analytics")).toBeInTheDocument();
    });
  });
});
