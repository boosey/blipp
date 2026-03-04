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

const CONFIG_RESPONSE = mockJsonResponse({ data: [] });

import Pipeline from "../../pages/admin/pipeline";

function renderPage() {
  return render(
    <MemoryRouter>
      <Pipeline />
    </MemoryRouter>
  );
}

describe("Pipeline", () => {
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
      mockJsonResponse({ data: [], total: 0 })
    );

    renderPage();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const urls = mockFetch.mock.calls.map((call: any[]) => call[0]);
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/pipeline/stages"));
    // Should fetch jobs for stages 2-5 (feed refresh removed)
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/pipeline/jobs?stage=2"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/pipeline/jobs?stage=3"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/pipeline/jobs?stage=4"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/pipeline/jobs?stage=5"));
    // Stage 1 should NOT be fetched
    expect(urls).not.toContainEqual(expect.stringContaining("/api/admin/pipeline/jobs?stage=1"));
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
      if (url.includes("/config")) return Promise.resolve(CONFIG_RESPONSE);
      return Promise.resolve(mockJsonResponse({
        data: [
          {
            stage: 1,
            activeJobs: 2,
            successRate: 98.5,
            avgProcessingTime: 1200,
            todayCost: 0.15,
          },
        ],
        total: 0,
      }));
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pipeline Flow")).toBeInTheDocument();
    });
  });

  it("does not render 'Run Feed Refresh' toolbar button (moved to Command Center/Catalog)", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/config")) return Promise.resolve(CONFIG_RESPONSE);
      if (url.includes("/pipeline/stages")) {
        return Promise.resolve(mockJsonResponse({
          data: [
            { stage: 2, name: "Transcription", activeJobs: 0, successRate: 100, avgProcessingTime: 0, todayCost: 0, perUnitCost: 0 },
          ],
        }));
      }
      return Promise.resolve(mockJsonResponse({ data: [], total: 0 }));
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pipeline Flow")).toBeInTheDocument();
    });

    expect(screen.queryByText("Run Feed Refresh")).not.toBeInTheDocument();
  });

  it("renders 4 stage column headers (stages 2-5, no Feed Refresh)", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/config")) return Promise.resolve(CONFIG_RESPONSE);
      if (url.includes("/pipeline/stages")) {
        return Promise.resolve(mockJsonResponse({
          data: [
            { stage: 2, name: "Transcription", activeJobs: 0, successRate: 100, avgProcessingTime: 0, todayCost: 0, perUnitCost: 0 },
            { stage: 3, name: "Distillation", activeJobs: 0, successRate: 100, avgProcessingTime: 0, todayCost: 0, perUnitCost: 0 },
            { stage: 4, name: "Clip Generation", activeJobs: 0, successRate: 100, avgProcessingTime: 0, todayCost: 0, perUnitCost: 0 },
            { stage: 5, name: "Briefing Assembly", activeJobs: 0, successRate: 100, avgProcessingTime: 0, todayCost: 0, perUnitCost: 0 },
          ],
        }));
      }
      return Promise.resolve(mockJsonResponse({ data: [], total: 0 }));
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pipeline Flow")).toBeInTheDocument();
    });

    // 4 stage names should be visible (no Feed Refresh)
    expect(screen.queryByText("Feed Refresh")).not.toBeInTheDocument();
    expect(screen.getByText("Transcription")).toBeInTheDocument();
    expect(screen.getByText("Distillation")).toBeInTheDocument();
    expect(screen.getByText("Clip Generation")).toBeInTheDocument();
    expect(screen.getByText("Briefing Assembly")).toBeInTheDocument();
  });
});
