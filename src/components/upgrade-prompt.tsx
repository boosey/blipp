import { useState } from "react";
import { Sparkles } from "lucide-react";
import { UpgradeModal } from "./upgrade-modal";

interface UpgradePromptProps {
  message: string;
}

/**
 * Inline upgrade prompt that opens the full upgrade modal on click.
 */
export function UpgradePrompt({ message }: UpgradePromptProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full bg-muted/50 border border-border rounded-xl p-4 text-left hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="text-sm font-medium text-foreground/80">Upgrade to unlock</span>
        </div>
        <p className="text-xs text-muted-foreground">{message}</p>
      </button>
      <UpgradeModal open={showModal} onOpenChange={setShowModal} message={message} />
    </>
  );
}

/**
 * Hook that returns a function to show the upgrade modal.
 * Use in components that need to gate actions behind plan limits.
 */
export function useUpgradeModal() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  function showUpgrade(msg: string) {
    setMessage(msg);
    setOpen(true);
  }

  const modal = (
    <UpgradeModal open={open} onOpenChange={setOpen} message={message} />
  );

  return { showUpgrade, UpgradeModalElement: modal };
}
