import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const { mockApiFetch } = vi.hoisted(() => {
  return { mockApiFetch: vi.fn() };
});

vi.mock("@clerk/clerk-react", () => ({
  useAuth: vi.fn(() => ({ getToken: vi.fn(() => Promise.resolve("token")) })),
  useUser: vi.fn(() => ({ user: { publicMetadata: {} } })),
  ClerkProvider: ({ children }: any) => children,
}));

vi.mock("@/lib/admin-api", () => ({
  useAdminFetch: () => mockApiFetch,
}));

import Pipeline from "../pages/admin/pipeline";

// Default mock responses
function mockStageStats() {
  return {
    data: [
      { stage: 2, name: "Transcription", activeJobs: 1, successRate: 95, avgProcessingTime: 5000, todayCost: 1.5, perUnitCost: 0.05 },
      { stage: 3, name: "Distillation", activeJobs: 0, successRate: 98, avgProcessingTime: 3000, todayCost: 0.8, perUnitCost: 0.03 },
      { stage: 4, name: "Clip Generation", activeJobs: 2, successRate: 90, avgProcessingTime: 8000, todayCost: 2.0, perUnitCost: 0.1 },
      { stage: 5, name: "Briefing Assembly", activeJobs: 0, successRate: 100, avgProcessingTime: 2000, todayCost: 0.5, perUnitCost: 0.02 },
    ],
  };
}

function mockJobs(stage: number, count: number) {
  return {
    data: Array.from({ length: count }, (_, i) => ({
      id: `job-${stage}-${i}`,
      type: "TRANSCRIPTION",
      status: i === 0 ? "IN_PROGRESS" : i === 1 ? "PENDING" : "COMPLETED",
      entityId: `ep-${i}`,
      entityType: "episode",
      stage,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      episodeTitle: `Episode ${i}`,
      podcastTitle: `Podcast ${i}`,
    })),
    total: count,
  };
}

function mockPipelineConfig() {
  return {
    data: [
      {
        category: "pipeline",
        entries: [
          { id: "1", key: "pipeline.enabled", value: true, updatedAt: new Date().toISOString() },
          { id: "2", key: "pipeline.minIntervalMinutes", value: 60, updatedAt: new Date().toISOString() },
          { id: "3", key: "pipeline.stage.2.enabled", value: true, updatedAt: new Date().toISOString() },
          { id: "4", key: "pipeline.stage.3.enabled", value: true, updatedAt: new Date().toISOString() },
          { id: "5", key: "pipeline.stage.4.enabled", value: true, updatedAt: new Date().toISOString() },
          { id: "6", key: "pipeline.stage.5.enabled", value: true, updatedAt: new Date().toISOString() },
        ],
      },
    ],
  };
}

function setupDefaultMocks() {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith("/pipeline/stages")) return Promise.resolve(mockStageStats());
    if (path.startsWith("/pipeline/jobs")) {
      const match = path.match(/stage=(\d+)/);
      const stage = match ? Number(match[1]) : 2;
      return Promise.resolve(mockJobs(stage, 3));
    }
    if (path.startsWith("/requests")) return Promise.resolve({ data: [] });
    if (path.startsWith("/config")) return Promise.resolve(mockPipelineConfig());
    return Promise.resolve({ data: [] });
  });
}

function renderPipeline() {
  return render(
    <MemoryRouter>
      <Pipeline />
    </MemoryRouter>
  );
}

describe("Pipeline Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders 4 stage columns (no Feed Refresh)", async () => {
    renderPipeline();
    await waitFor(() => {
      expect(screen.getByTestId("pipeline-columns")).toBeInTheDocument();
    });

    // Should have 4 stage columns
    const columns = screen.getAllByTestId(/^stage-column-/);
    expect(columns).toHaveLength(4);

    // Stage numbers should be 2, 3, 4, 5
    expect(screen.getByTestId("stage-column-2")).toBeInTheDocument();
    expect(screen.getByTestId("stage-column-3")).toBeInTheDocument();
    expect(screen.getByTestId("stage-column-4")).toBeInTheDocument();
    expect(screen.getByTestId("stage-column-5")).toBeInTheDocument();

    // Should NOT have a stage 1 column
    expect(screen.queryByTestId("stage-column-1")).not.toBeInTheDocument();
  });

  it("renders the summary bar with correct counts", async () => {
    renderPipeline();
    await waitFor(() => {
      expect(screen.getByTestId("pipeline-summary-bar")).toBeInTheDocument();
    });

    // Each stage returns 3 jobs: 1 IN_PROGRESS, 1 PENDING, 1 COMPLETED
    // 4 stages = 4 IN_PROGRESS, 4 PENDING, 4 COMPLETED
    const summaryBar = screen.getByTestId("pipeline-summary-bar");
    expect(summaryBar).toHaveTextContent("4Queued");
    expect(summaryBar).toHaveTextContent("4Processing");
    expect(summaryBar).toHaveTextContent("4Completed");
    expect(summaryBar).toHaveTextContent("0Failed");
  });

  it("does not render a Run Feed Refresh button", async () => {
    renderPipeline();
    await waitFor(() => {
      expect(screen.getByTestId("pipeline-columns")).toBeInTheDocument();
    });

    expect(screen.queryByText("Run Feed Refresh")).not.toBeInTheDocument();
  });
});
