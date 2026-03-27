import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import type { AdminPlan } from "@/types/admin";

export interface DeactivateDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: AdminPlan | null;
  onConfirm: () => void;
  confirming: boolean;
}

export function DeactivateDialog({
  open,
  onOpenChange,
  plan,
  onConfirm,
  confirming,
}: DeactivateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Deactivate Plan</DialogTitle>
          <DialogDescription className="text-xs text-[#9CA3AF]">
            Are you sure you want to deactivate "{plan?.name}"?
          </DialogDescription>
        </DialogHeader>

        {plan && plan.userCount > 0 && (
          <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-[#EF4444] shrink-0 mt-0.5" />
            <div className="text-xs text-[#EF4444] space-y-1">
              <p className="font-medium">
                {plan.userCount} active user{plan.userCount !== 1 ? "s" : ""} on this plan
              </p>
              <p className="text-[#EF4444]/80">
                Deactivating will hide this plan from new signups. Existing users will remain on the plan but it will no longer be selectable.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[#9CA3AF]"
          >
            Cancel
          </Button>
          <Button
            className="bg-[#F59E0B] hover:bg-[#F59E0B]/80 text-white"
            disabled={confirming}
            onClick={onConfirm}
          >
            {confirming ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Deactivating...
              </>
            ) : (
              "Deactivate"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
