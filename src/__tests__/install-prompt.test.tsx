import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallPrompt } from "../components/install-prompt";

describe("InstallPrompt", () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    originalMatchMedia = window.matchMedia;
    // Default: not in standalone mode
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("does not render by default (no beforeinstallprompt event)", () => {
    const { container } = render(<InstallPrompt />);
    expect(container.innerHTML).toBe("");
  });

  it("renders banner after beforeinstallprompt event fires", () => {
    render(<InstallPrompt />);

    act(() => {
      const event = new Event("beforeinstallprompt", {
        cancelable: true,
      });
      (event as any).prompt = vi.fn().mockResolvedValue(undefined);
      (event as any).userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(event);
    });

    expect(screen.getByText("Install Blipp")).toBeInTheDocument();
    expect(
      screen.getByText("Add to your home screen for quick access")
    ).toBeInTheDocument();
  });

  it("clicking Install calls prompt() on the deferred event", async () => {
    const user = userEvent.setup();
    const mockPrompt = vi.fn().mockResolvedValue(undefined);

    render(<InstallPrompt />);

    act(() => {
      const event = new Event("beforeinstallprompt", {
        cancelable: true,
      });
      (event as any).prompt = mockPrompt;
      (event as any).userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(event);
    });

    const installButton = screen.getByText("Install");
    await user.click(installButton);

    expect(mockPrompt).toHaveBeenCalled();
  });

  it("clicking X dismisses and sets sessionStorage", async () => {
    const user = userEvent.setup();

    render(<InstallPrompt />);

    act(() => {
      const event = new Event("beforeinstallprompt", {
        cancelable: true,
      });
      (event as any).prompt = vi.fn().mockResolvedValue(undefined);
      (event as any).userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(event);
    });

    expect(screen.getByText("Install Blipp")).toBeInTheDocument();

    const dismissButton = screen.getByLabelText("Dismiss");
    await user.click(dismissButton);

    // Banner should be gone
    expect(screen.queryByText("Install Blipp")).not.toBeInTheDocument();
    // Session storage should be set
    expect(sessionStorage.getItem("blipp-install-prompt-dismissed")).toBe("1");
  });

  it("does not show if sessionStorage dismissal key exists", () => {
    sessionStorage.setItem("blipp-install-prompt-dismissed", "1");

    render(<InstallPrompt />);

    act(() => {
      const event = new Event("beforeinstallprompt", {
        cancelable: true,
      });
      (event as any).prompt = vi.fn().mockResolvedValue(undefined);
      (event as any).userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(event);
    });

    expect(screen.queryByText("Install Blipp")).not.toBeInTheDocument();
  });

  it("does not show in standalone display mode", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });

    render(<InstallPrompt />);

    act(() => {
      const event = new Event("beforeinstallprompt", {
        cancelable: true,
      });
      (event as any).prompt = vi.fn().mockResolvedValue(undefined);
      (event as any).userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(event);
    });

    expect(screen.queryByText("Install Blipp")).not.toBeInTheDocument();
  });
});
