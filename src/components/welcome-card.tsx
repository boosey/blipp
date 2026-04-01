import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Progress } from "./ui/progress";

interface WelcomeCardProps {
  readyCount: number;
  totalCount: number;
  timedOut: boolean;
  onRetry: () => void;
}

export function WelcomeCard({ readyCount, totalCount, timedOut, onRetry }: WelcomeCardProps) {
  const percent = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 mb-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-base">Welcome to Blipp!</h2>
          {timedOut ? (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Some briefings are taking longer than expected.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              We're creating briefings for your {totalCount} subscription{totalCount !== 1 ? "s" : ""}.
              This usually takes 1–2 minutes.
            </p>
          )}
        </div>
      </div>

      {timedOut ? (
        <button
          onClick={onRetry}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-transform"
        >
          Refresh
        </button>
      ) : (
        <div className="space-y-1.5">
          <Progress value={percent} aria-label={`${readyCount} of ${totalCount} briefings ready`} />
          <p className="text-xs text-muted-foreground text-right">
            {readyCount} of {totalCount} ready
          </p>
        </div>
      )}

      <Link
        to="/discover"
        className="block text-center text-sm font-medium text-primary mt-3 hover:underline"
      >
        Explore more →
      </Link>
    </div>
  );
}
