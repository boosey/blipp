import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BriefingPlayer } from "../components/briefing-player";

const defaultProps = {
  audioUrl: "https://example.com/audio.mp3",
  title: "Morning Briefing",
  segments: [
    { podcastTitle: "Tech Today", transitionText: "Up first, the latest in tech." },
    { podcastTitle: "Science Hour", transitionText: "Next, a deep dive into science." },
  ],
};

describe("BriefingPlayer", () => {
  it("renders title and segments", () => {
    render(<BriefingPlayer {...defaultProps} />);

    expect(screen.getByText("Morning Briefing")).toBeInTheDocument();
    expect(screen.getByText("Tech Today")).toBeInTheDocument();
    expect(screen.getByText("Science Hour")).toBeInTheDocument();
    expect(screen.getByText("Up first, the latest in tech.")).toBeInTheDocument();
  });

  it("play button toggles text between play and pause", async () => {
    render(<BriefingPlayer {...defaultProps} />);
    const user = userEvent.setup();

    const button = screen.getByRole("button", { name: "Play" });
    expect(button).toHaveTextContent("\u25B6");

    // Mock the audio play method since jsdom doesn't support it
    const audio = screen.getByTestId("audio-element") as HTMLAudioElement;
    audio.play = vi.fn().mockResolvedValue(undefined);
    audio.pause = vi.fn();

    await user.click(button);
    expect(screen.getByRole("button", { name: "Pause" })).toHaveTextContent("||");

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toHaveTextContent("\u25B6");
  });

  it("renders progress bar", () => {
    render(<BriefingPlayer {...defaultProps} />);
    expect(screen.getByTestId("progress-bar")).toBeInTheDocument();
  });
});
