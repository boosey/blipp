import { Link } from "react-router-dom";
import { Lock } from "lucide-react";

interface UpgradePromptProps {
  message: string;
  inline?: boolean;
}

/**
 * Upgrade prompt shown when a user action is blocked by plan limits.
 * `inline` renders a small inline badge; default renders a card.
 */
export function UpgradePrompt({ message, inline }: UpgradePromptProps) {
  if (inline) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
        <Lock className="w-3 h-3" />
        <Link to="/pricing" className="underline underline-offset-2 hover:text-amber-300">
          Upgrade
        </Link>
      </span>
    );
  }

  return (
    <div className="bg-amber-900/15 border border-amber-800/30 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <p className="text-sm text-amber-200">{message}</p>
      </div>
      <Link
        to="/pricing"
        className="inline-block px-4 py-1.5 bg-amber-500 text-zinc-950 text-sm font-medium rounded-lg hover:bg-amber-400 transition-colors"
      >
        View Plans
      </Link>
    </div>
  );
}
