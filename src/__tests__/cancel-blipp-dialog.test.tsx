import { render, screen, fireEvent } from "@testing-library/react";
import { CancelBlippDialog } from "../components/cancel-blipp-dialog";

describe("CancelBlippDialog", () => {
  it("renders dialog content when open", () => {
    render(
      <CancelBlippDialog open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />
    );
    expect(screen.getByText("Cancel this briefing?")).toBeInTheDocument();
    expect(screen.getByText(/won't be deleted/)).toBeInTheDocument();
    expect(screen.getByText("Keep it")).toBeInTheDocument();
    expect(screen.getByText("Yes, cancel")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button clicked", () => {
    const onConfirm = vi.fn();
    render(
      <CancelBlippDialog open={true} onOpenChange={vi.fn()} onConfirm={onConfirm} />
    );
    fireEvent.click(screen.getByText("Yes, cancel"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("does not render when closed", () => {
    render(
      <CancelBlippDialog open={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />
    );
    expect(screen.queryByText("Cancel this briefing?")).not.toBeInTheDocument();
  });
});
