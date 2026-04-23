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

vi.mock("@/lib/api-client", () => ({
  useAdminFetch: () => mockApiFetch,
}));

import Pipeline from "../pages/admin/pipeline";

// The 5 pipeline stages (CLIP_GENERATION was split into NARRATIVE_GENERATION + AUDIO_GENERATION)
const STAGES = ["TRANSCRIPTION", "DISTILLATION", "NARRATIVE_GENERATION", "AUDIO_GENERATION", "BRIEFING_ASSEMBLY"];

// Default mock responses
function mockStageStats() {
  return {
    data: [
      { stage: "TRANSCRIPTION", name: "Transcription", activeJobs: 1, successRate: 95, avgProcessingTime: 5000, todayCost: 1.5, perUnitCost: 0.05 },
      { stage: "DISTILLATION", name: "Distillation", activeJobs: 0, successRate: 98, avgProcessingTime: 3000, todayCost: 0.8, perUnitCost: 0.03 },
      { stage: "NARRATIVE_GENERATION", name: "Narrative Gen", activeJobs: 1, successRate: 92, avgProcessingTime: 6000, todayCost: 1.2, perUnitCost: 0.06 },
      { stage: "AUDIO_GENERATION", name: "Audio Gen", activeJobs: 1, successRate: 90, avgProcessingTime: 8000, todayCost: 2.0, perUnitCost: 0.1 },
      { stage: "BRIEFING_ASSEMBLY", name: "Briefing Assembly", activeJobs: 0, successRate: 100, avgProcessingTime: 2000, todayCost: 0.5, perUnitCost: 0.02 },
    ],
  };
}

function mockJobs(stage: string, count: number) {
  return {
    data: Array.from({ length: count }, (_, i) => ({
      id: `job-${stage}-${i}`,
      requestId: `req-${i}`,
      episodeId: `ep-${i}`,
      durationTier: 5,
      status: i === 0 ? "IN_PROGRESS" : i === 1 ? "PENDING" : "COMPLETED",
      currentStage: stage,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      // Extract currentStage from query params
      const match = path.match(/currentStage=([A-Z_]+)/);
      const stage = match ? match[1] : "TRANSCRIPTION";
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

  it("renders 5 stage columns (no Feed Refresh)", async () => {
    renderPipeline();
    await waitFor(() => {
      expect(screen.getByTestId("pipeline-columns")).toBeInTheDocument();
    });

    // Should have 5 stage columns
    const columns = screen.getAllByTestId(/^stage-column-/);
    expect(columns).toHaveLength(5);

    // Stage names as test IDs
    for (const stage of STAGES) {
      expect(screen.getByTestId(`stage-column-${stage}`)).toBeInTheDocument();
    }
  });

  it("does not render a Run Feed Refresh button", async () => {
    renderPipeline();
    await waitFor(() => {
      expect(screen.getByTestId("pipeline-columns")).toBeInTheDocument();
    });

    expect(screen.queryByText("Run Feed Refresh")).not.toBeInTheDocument();
  });
});
