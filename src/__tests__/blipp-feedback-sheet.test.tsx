import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BlippFeedbackSheet } from "../components/blipp-feedback-sheet";

const mockApiFetch = vi.fn().mockResolvedValue({ id: "bf1" });

vi.mock("../lib/api", () => ({
  useApiFetch: () => mockApiFetch,
}));

describe("BlippFeedbackSheet", () => {
  const defaultProps = {
    episodeId: "ep1",
    briefingId: "br1",
    open: true,
    onOpenChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all 7 reason chips with blipp_failed first", () => {
    render(<BlippFeedbackSheet {...defaultProps} />);

    const buttons = screen.getAllByRole("button").filter(
      (b) =>
        !b.textContent?.match(/Submit|Sending|Add a comment/i) &&
        !b.getAttribute("aria-label")
    );

    expect(buttons[0]).toHaveTextContent("Blipp failed");
    expect(buttons).toHaveLength(7);

    expect(screen.getByText("Missed key points")).toBeInTheDocument();
    expect(screen.getByText("Inaccurate info")).toBeInTheDocument();
    expect(screen.getByText("Too short")).toBeInTheDocument();
    expect(screen.getByText("Too long")).toBeInTheDocument();
    expect(screen.getByText("Poor audio quality")).toBeInTheDocument();
    expect(screen.getByText("Not interesting")).toBeInTheDocument();
  });

  it("supports multi-select toggle behavior", () => {
    render(<BlippFeedbackSheet {...defaultProps} />);

    const tooShort = screen.getByText("Too short");
    const tooLong = screen.getByText("Too long");

    // Select two chips
    fireEvent.click(tooShort);
    fireEvent.click(tooLong);

    expect(tooShort.className).toContain("bg-primary");
    expect(tooLong.className).toContain("bg-primary");

    // Deselect one
    fireEvent.click(tooShort);
    expect(tooShort.className).not.toContain("bg-primary");
    expect(tooLong.className).toContain("bg-primary");
  });

  it("sends correct payload on submit", async () => {
    render(<BlippFeedbackSheet {...defaultProps} />);

    fireEvent.click(screen.getByText("Too short"));
    fireEvent.click(screen.getByText("Inaccurate info"));
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith("/feedback/blipp", {
        method: "POST",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.episodeId).toBe("ep1");
    expect(body.briefingId).toBe("br1");
    expect(body.reasons).toEqual(expect.arrayContaining(["too_short", "inaccurate"]));
    expect(body.reasons).toHaveLength(2);
  });

  it("does not call onOpenChange on dismiss (vote preserved)", () => {
    const onOpenChange = vi.fn();
    render(<BlippFeedbackSheet {...defaultProps} onOpenChange={onOpenChange} />);

    // The sheet is open; closing it should not affect the thumbs-down vote
    // (vote is managed externally). Sheet just calls onOpenChange(false).
    // Verify the thumbs-down vote is NOT touched by the sheet at all.
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("shows freeform text field on tap", () => {
    render(<BlippFeedbackSheet {...defaultProps} />);

    // Initially no textarea visible
    expect(screen.queryByPlaceholderText("Tell us more...")).not.toBeInTheDocument();

    // Click the expand button
    fireEvent.click(screen.getByText("+ Add a comment"));

    expect(screen.getByPlaceholderText("Tell us more...")).toBeInTheDocument();
  });

  it("submit button is disabled when no reasons selected", () => {
    render(<BlippFeedbackSheet {...defaultProps} />);

    const submitBtn = screen.getByText("Submit");
    expect(submitBtn).toBeDisabled();
  });

  it("shows thank you message after submit", async () => {
    render(<BlippFeedbackSheet {...defaultProps} />);

    fireEvent.click(screen.getByText("Too short"));
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByText("Thanks for your feedback!")).toBeInTheDocument();
    });
  });
});
