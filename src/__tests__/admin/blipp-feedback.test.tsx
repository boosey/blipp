import { render, screen, waitFor } from "@testing-library/react";
import AdminBlippFeedback from "../../pages/admin/blipp-feedback";

const mockAdminFetch = vi.fn();

vi.mock("../../lib/api-client", () => ({
  useAdminFetch: () => mockAdminFetch,
}));

describe("AdminBlippFeedback page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminFetch.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
  });

  it("renders with filter controls", async () => {
    render(<AdminBlippFeedback />);

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
    });
    expect(screen.getByText("Technical failures")).toBeInTheDocument();
    expect(screen.getByText("Content feedback")).toBeInTheDocument();
  });

  it("renders the page title", async () => {
    render(<AdminBlippFeedback />);

    await waitFor(() => {
      expect(screen.getByText("Blipp Feedback")).toBeInTheDocument();
    });
  });
});
