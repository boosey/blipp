import { render, screen, act } from "@testing-library/react";
import { OfflineIndicator } from "../components/offline-indicator";

describe("OfflineIndicator", () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(
    navigator,
    "onLine"
  );

  afterEach(() => {
    // Restore navigator.onLine
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      writable: true,
      value: true,
    });
  });

  afterAll(() => {
    if (originalOnLine) {
      Object.defineProperty(navigator, "onLine", originalOnLine);
    }
  });

  it("does not render when navigator.onLine is true", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      writable: true,
      value: true,
    });

    const { container } = render(<OfflineIndicator />);
    expect(container.innerHTML).toBe("");
  });

  it("renders banner when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      writable: true,
      value: false,
    });

    render(<OfflineIndicator />);
    expect(
      screen.getByText(
        "You're offline. Previously played briefings are still available."
      )
    ).toBeInTheDocument();
  });

  it("renders wifi icon when offline", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      writable: true,
      value: false,
    });

    const { container } = render(<OfflineIndicator />);
    // WifiOff renders as an SVG
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("disappears when online event fires", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      writable: true,
      value: false,
    });

    const { container } = render(<OfflineIndicator />);
    expect(
      screen.getByText(
        "You're offline. Previously played briefings are still available."
      )
    ).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(container.innerHTML).toBe("");
  });

  it("appears when offline event fires", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      writable: true,
      value: true,
    });

    const { container } = render(<OfflineIndicator />);
    expect(container.innerHTML).toBe("");

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(
      screen.getByText(
        "You're offline. Previously played briefings are still available."
      )
    ).toBeInTheDocument();
  });
});
