import { ThumbsUp, ThumbsDown } from "lucide-react";

export function ThumbButtons({
  vote,
  onVote,
  size = "sm",
}: {
  vote: number; // 1, -1, or 0
  onVote: (vote: number) => void;
  size?: "sm" | "md";
}) {
  const iconClass = size === "md" ? "w-5 h-5" : "w-4 h-4";
  const btnClass = size === "md" ? "p-2" : "p-1.5";

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onVote(vote === 1 ? 0 : 1);
        }}
        className={`${btnClass} rounded-full transition-colors ${
          vote === 1
            ? "text-green-400 bg-green-400/15"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
        aria-label={vote === 1 ? "Remove thumbs up" : "Thumbs up"}
      >
        <ThumbsUp className={iconClass} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onVote(vote === -1 ? 0 : -1);
        }}
        className={`${btnClass} rounded-full transition-colors ${
          vote === -1
            ? "text-red-400 bg-red-400/15"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
        aria-label={vote === -1 ? "Remove thumbs down" : "Thumbs down"}
      >
        <ThumbsDown className={iconClass} />
      </button>
    </div>
  );
}
