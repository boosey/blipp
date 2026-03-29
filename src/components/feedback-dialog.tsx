import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApiFetch } from "@/lib/api";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const apiFetch = useApiFetch();

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ message: message.trim() }),
      });
      setSubmitted(true);
      setTimeout(() => {
        onOpenChange(false);
        setMessage("");
        setSubmitted(false);
      }, 1500);
    } catch {
      // Silently fail for now — feedback endpoint may not exist yet
      setSubmitted(true);
      setTimeout(() => {
        onOpenChange(false);
        setMessage("");
        setSubmitted(false);
      }, 1500);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            Let us know what you think — bugs, ideas, or anything else.
          </DialogDescription>
        </DialogHeader>
        {submitted ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Thanks for your feedback!
          </p>
        ) : (
          <>
            <Textarea
              placeholder="What's on your mind?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              autoFocus
            />
            <DialogFooter>
              <Button
                onClick={handleSubmit}
                disabled={!message.trim() || submitting}
              >
                {submitting ? "Sending..." : "Send"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
