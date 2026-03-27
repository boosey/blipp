import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { AiModelEntry } from "@/types/admin";

export interface DeleteModelDialogProps {
  model: AiModelEntry | null;
  onClose: () => void;
  onConfirm: (model: AiModelEntry) => void;
}

export function DeleteModelDialog({ model, onClose, onConfirm }: DeleteModelDialogProps) {
  return (
    <Dialog open={!!model} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#0F1D32] border-white/10 sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-[#F9FAFB]">Delete Model</DialogTitle>
          <DialogDescription className="text-[#9CA3AF]">
            This will permanently delete <span className="font-semibold text-[#F9FAFB]">{model?.label}</span> and
            all {model?.providers.length ?? 0} provider{model?.providers.length === 1 ? "" : "s"}.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-[#9CA3AF] text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => model && onConfirm(model)}
            className="bg-[#EF4444] hover:bg-[#EF4444]/80 text-white text-xs"
          >
            Delete Model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface NoProvidersDialogProps {
  open: boolean;
  onClose: () => void;
  onDeleteModel: () => void;
}

export function NoProvidersDialog({ open, onClose, onDeleteModel }: NoProvidersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#0F1D32] border-white/10 sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-[#F9FAFB]">No Providers Remaining</DialogTitle>
          <DialogDescription className="text-[#9CA3AF]">
            This model has no providers left. Would you like to delete the model entry too?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-[#9CA3AF] text-xs">
            Keep Model
          </Button>
          <Button
            size="sm"
            onClick={onDeleteModel}
            className="bg-[#EF4444] hover:bg-[#EF4444]/80 text-white text-xs"
          >
            Delete Model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
