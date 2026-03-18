import { render, screen, fireEvent } from "@testing-library/react";
import { TierPicker } from "../components/tier-picker";

describe("TierPicker", () => {
  it("renders all duration tier buttons", () => {
    render(
      <TierPicker
        selected={null}
        onSelect={vi.fn()}
        maxDurationMinutes={30}
      />
    );
    expect(screen.getByText("2m")).toBeInTheDocument();
    expect(screen.getByText("5m")).toBeInTheDocument();
    expect(screen.getByText("10m")).toBeInTheDocument();
    expect(screen.getByText("15m")).toBeInTheDocument();
    expect(screen.getByText("30m")).toBeInTheDocument();
  });

  it("highlights selected tier", () => {
    render(
      <TierPicker
        selected={5}
        onSelect={vi.fn()}
        maxDurationMinutes={30}
      />
    );
    const button5m = screen.getByText("5m").closest("button")!;
    expect(button5m.className).toContain("bg-primary");
  });

  it("calls onSelect when unlocked tier is clicked", () => {
    const onSelect = vi.fn();
    render(
      <TierPicker
        selected={null}
        onSelect={onSelect}
        maxDurationMinutes={30}
      />
    );
    fireEvent.click(screen.getByText("10m"));
    expect(onSelect).toHaveBeenCalledWith(10);
  });

  it("calls onUpgrade for locked tiers", () => {
    const onUpgrade = vi.fn();
    render(
      <TierPicker
        selected={null}
        onSelect={vi.fn()}
        maxDurationMinutes={5}
        onUpgrade={onUpgrade}
      />
    );
    fireEvent.click(screen.getByText("10m"));
    expect(onUpgrade).toHaveBeenCalledWith(
      "Your plan supports briefings up to 5 minutes. Upgrade for longer briefings."
    );
  });

  it("does not call onSelect for locked tiers", () => {
    const onSelect = vi.fn();
    render(
      <TierPicker
        selected={null}
        onSelect={onSelect}
        maxDurationMinutes={5}
        onUpgrade={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("10m"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
