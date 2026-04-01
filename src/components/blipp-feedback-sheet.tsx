import { useState } from "react";
import { X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApiFetch } from "@/lib/api";

const REASONS = [
  { value: "blipp_failed", label: "Blipp failed" },
  { value: "missed_key_points", label: "Missed key points" },
  { value: "inaccurate", label: "Inaccurate info" },
  { value: "too_short", label: "Too short" },
  { value: "too_long", label: "Too long" },
  { value: "poor_audio", label: "Poor audio quality" },
  { value: "not_interesting", label: "Not interesting" },
] as const;

interface BlippFeedbackSheetProps {
  episodeId: string;
  briefingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BlippFeedbackSheet({
  episodeId,
  briefingId,
  open,
  onOpenChange,
}: BlippFeedbackSheetProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [showMessage, setShowMessage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const apiFetch = useApiFetch();

  const toggle = (reason: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(reason)) next.delete(reason);
      else next.add(reason);
      return next;
    });
  };

  const reset = () => {
    setSelected(new Set());
    setMessage("");
    setShowMessage(false);
    setSubmitted(false);
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      await apiFetch("/feedback/blipp", {
        method: "POST",
        body: JSON.stringify({
          episodeId,
          briefingId,
          reasons: [...selected],
          message: message.trim() || undefined,
        }),
      });
      setSubmitted(true);
      setTimeout(() => {
        onOpenChange(false);
        reset();
      }, 1500);
    } catch {
      setSubmitted(true);
      setTimeout(() => {
        onOpenChange(false);
        reset();
      }, 1500);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) reset();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl bg-background border-border px-4 pt-3 pb-[max(5rem,calc(3.5rem+env(safe-area-inset-bottom)))]"
      >
        <div className="w-full flex justify-center mb-3 relative">
          <div className="w-10 h-1 rounded-full bg-muted" />
          <button
            onClick={() => handleOpenChange(false)}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close feedback"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <SheetTitle className="text-base font-semibold mb-1">
          What could be better?
        </SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground mb-3">
          Select all that apply
        </SheetDescription>

        {submitted ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Thanks for your feedback!
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => toggle(r.value)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    selected.has(r.value)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {showMessage ? (
              <Textarea
                placeholder="Tell us more..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={2000}
                className="mb-3"
              />
            ) : (
              <button
                onClick={() => setShowMessage(true)}
                className="text-sm text-muted-foreground hover:text-foreground mb-3"
              >
                + Add a comment
              </button>
            )}

            <Button
              onClick={handleSubmit}
              disabled={selected.size === 0 || submitting}
              className="w-full"
            >
              {submitting ? "Sending..." : "Submit"}
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
