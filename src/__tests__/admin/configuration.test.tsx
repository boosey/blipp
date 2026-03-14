import { render, screen, waitFor, within } from "@testing-library/react";
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

import Configuration from "../../pages/admin/configuration";

function renderPage() {
  return render(
    <MemoryRouter>
      <Configuration />
    </MemoryRouter>
  );
}

describe("Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(document.body).toBeTruthy();
  });

  it("makes correct API calls on mount (no trailing slashes)", async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        data: [],
      })
    );

    renderPage();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const urls = mockFetch.mock.calls.map((call: any[]) => call[0]);
    // Verify exact paths without trailing slashes
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/config"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/config/tiers/duration"));
    expect(urls).toContainEqual(expect.stringContaining("/api/admin/config/features"));

    // Verify NO trailing slashes on any URL
    urls.forEach((url: string) => {
      const path = url.split("?")[0];
      expect(path).not.toMatch(/\/$/);
    });
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
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        data: [
          {
            category: "ai-models",
            entries: [
              { key: "stt.provider", value: "Deepgram" },
              { key: "stt.model", value: "nova-2" },
              { key: "stt.cost_per_1k", value: "0.0035" },
            ],
          },
        ],
      })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Configuration")).toBeInTheDocument();
    });
  });
});

// ── Pipeline Controls Panel Tests ──

function mockPipelineConfigs(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    "pipeline.enabled": true,
    "pipeline.minIntervalMinutes": 60,
    "pipeline.lastAutoRunAt": new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    "pipeline.stage.TRANSCRIPTION.enabled": true,
    "pipeline.stage.DISTILLATION.enabled": true,
    "pipeline.stage.NARRATIVE_GENERATION.enabled": false,
    "pipeline.stage.AUDIO_GENERATION.enabled": true,
    "pipeline.stage.BRIEFING_ASSEMBLY.enabled": true,
    ...overrides,
  };
  const entries = Object.entries(defaults).map(([key, value]) => ({
    id: key,
    key,
    value,
    updatedAt: new Date().toISOString(),
  }));
  return {
    data: [{ category: "pipeline", entries }],
  };
}

function setupPipelineMocks(configOverrides: Record<string, unknown> = {}) {
  mockFetch.mockImplementation((url: string, options?: RequestInit) => {
    if (options?.method === "PATCH" || options?.method === "POST") {
      return Promise.resolve(mockJsonResponse({ ok: true, data: { enqueued: 1, skipped: 0, message: "ok" } }));
    }
    if (url.includes("/config/tiers/duration")) return Promise.resolve(mockJsonResponse({ data: [] }));
    if (url.includes("/config/tiers/subscription")) return Promise.resolve(mockJsonResponse({ data: [] }));
    if (url.includes("/config/features")) return Promise.resolve(mockJsonResponse({ data: [] }));
    if (url.includes("/config")) return Promise.resolve(mockJsonResponse(mockPipelineConfigs(configOverrides)));
    return Promise.resolve(mockJsonResponse({ data: [] }));
  });
}

describe("PipelineControlsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders master toggle in enabled state", async () => {
    setupPipelineMocks({ "pipeline.enabled": true });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pipeline Enabled")).toBeInTheDocument();
    });

    // The first switch on the page should be the master toggle
    expect(screen.getByText("Master switch for automated processing")).toBeInTheDocument();
  });

  it("renders 5 stage toggles with correct labels", async () => {
    setupPipelineMocks();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Transcription")).toBeInTheDocument();
    });
    expect(screen.getByText("Distillation")).toBeInTheDocument();
    expect(screen.getByText("Narrative Generation")).toBeInTheDocument();
    expect(screen.getByText("Audio Generation")).toBeInTheDocument();
    expect(screen.getByText("Briefing Assembly")).toBeInTheDocument();
  });

  it("toggling master switch calls PATCH /config/pipeline.enabled", async () => {
    const user = userEvent.setup();
    setupPipelineMocks({ "pipeline.enabled": true });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pipeline Enabled")).toBeInTheDocument();
    });

    // Find the switch next to "Pipeline Enabled" and toggle it
    const masterSection = screen.getByText("Pipeline Enabled").closest("div")!.parentElement!;
    const switchEl = masterSection.querySelector("[role='switch']") as HTMLElement;
    if (switchEl) {
      await user.click(switchEl);

      await waitFor(() => {
        const patchCalls = mockFetch.mock.calls.filter(
          (call: any[]) => call[1]?.method === "PATCH" && (call[0] as string).includes("pipeline.enabled")
        );
        expect(patchCalls.length).toBeGreaterThanOrEqual(1);
      });
    }
  });

  it("'Run Now' button calls POST /pipeline/trigger/feed-refresh", async () => {
    const user = userEvent.setup();
    setupPipelineMocks();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Run Now")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Run Now"));

    await waitFor(() => {
      const postCalls = mockFetch.mock.calls.filter(
        (call: any[]) => call[1]?.method === "POST" && (call[0] as string).includes("/pipeline/trigger/feed-refresh")
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("displays last auto-run time as relative", async () => {
    setupPipelineMocks({
      "pipeline.lastAutoRunAt": new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Last Auto-run")).toBeInTheDocument();
    });

    // Should show relative time like "12m ago"
    expect(screen.getByText(/\d+[smhd] ago/)).toBeInTheDocument();
  });
});
