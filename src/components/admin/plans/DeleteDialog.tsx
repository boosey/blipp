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

export interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: AdminPlan | null;
  onConfirm: () => void;
  deleting: boolean;
}

export function DeleteDialog({
  open,
  onOpenChange,
  plan,
  onConfirm,
  deleting,
}: DeleteDialogProps) {
  if (!plan) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Delete Plan</DialogTitle>
          <DialogDescription className="text-xs text-[#9CA3AF]">
            This will soft-delete the plan "{plan.name}".
          </DialogDescription>
        </DialogHeader>

        {plan.userCount > 0 && (
          <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#EF4444] shrink-0" />
            <span className="text-xs text-[#EF4444]">
              This plan has {plan.userCount} active user{plan.userCount !== 1 ? "s" : ""}
            </span>
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
            className="bg-[#EF4444] hover:bg-[#EF4444]/80 text-white"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
