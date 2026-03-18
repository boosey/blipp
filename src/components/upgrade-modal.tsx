import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { PlanCards } from "./plan-cards";
import { usePlan } from "../contexts/plan-context";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message?: string;
}

/**
 * Friendly upgrade modal shown when a user action is blocked by plan limits.
 * Shows the plan cards (same as pricing page) in compact mode.
 */
export function UpgradeModal({ open, onOpenChange, message }: UpgradeModalProps) {
  const { plan } = usePlan();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-border text-foreground max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Upgrade your plan</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {message || "Unlock this feature by upgrading to a higher plan."}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <PlanCards currentPlanSlug={plan.slug} compact />
        </div>
      </DialogContent>
    </Dialog>
  );
}
