import { useState, useMemo } from "react";
import { HardDrive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useStorage } from "../contexts/storage-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";

const BUDGET_OPTIONS = [
  { bytes: 250 * 1024 * 1024, label: "250 MB" },
  { bytes: 500 * 1024 * 1024, label: "500 MB", recommended: true },
  { bytes: 1024 * 1024 * 1024, label: "1 GB" },
  { bytes: 2 * 1024 * 1024 * 1024, label: "2 GB" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatRelativeTime(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function StorageSettings() {
  const { usage, clearCache, setBudget, isReady, manager } = useStorage();
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [entries, setEntries] = useState<{ count: number; oldestCachedAt: number | null } | null>(null);

  // Fetch entry metadata on mount
  useMemo(() => {
    if (!isReady) return;
    manager.getAllEntries().then((all) => {
      if (all.length === 0) {
        setEntries({ count: 0, oldestCachedAt: null });
      } else {
        const oldest = all.reduce((min, e) => (e.cachedAt < min ? e.cachedAt : min), all[0].cachedAt);
        setEntries({ count: all.length, oldestCachedAt: oldest });
      }
    });
  }, [isReady, manager, usage]);

  if (!isReady || !usage) {
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Storage & Downloads</h2>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="h-20 flex items-center justify-center text-sm text-muted-foreground">
            Loading storage info...
          </div>
        </div>
      </section>
    );
  }

  const pct = usage.budgetBytes > 0
    ? Math.min((usage.usedBytes / usage.budgetBytes) * 100, 100)
    : 0;

  async function handleClear() {
    setClearing(true);
    try {
      await clearCache();
      setEntries({ count: 0, oldestCachedAt: null });
      toast.success("All downloads cleared");
    } catch {
      toast.error("Failed to clear downloads");
    } finally {
      setClearing(false);
      setClearOpen(false);
    }
  }

  function handleBudgetChange(bytes: number) {
    setBudget(bytes);
    toast.success(`Storage limit set to ${formatBytes(bytes)}`);
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Storage & Downloads</h2>
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        {/* Usage bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-muted-foreground" />
              Storage Used
            </span>
            <span className="text-muted-foreground">
              {formatBytes(usage.usedBytes)} / {formatBytes(usage.budgetBytes)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Cached blipps</span>
            <span>{entries?.count ?? 0} items</span>
          </div>
          {entries?.oldestCachedAt && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Oldest cached</span>
              <span>{formatRelativeTime(entries.oldestCachedAt)}</span>
            </div>
          )}
        </div>

        {/* Clear all */}
        <button
          onClick={() => setClearOpen(true)}
          disabled={usage.entryCount === 0}
          className="flex items-center gap-2 text-sm text-red-500 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
          Clear All Downloads
        </button>

        <Dialog open={clearOpen} onOpenChange={setClearOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clear All Downloads</DialogTitle>
              <DialogDescription>
                This will remove all {entries?.count ?? 0} cached blipps
                ({formatBytes(usage.usedBytes)}). You'll need to re-download them
                for offline listening.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                onClick={() => setClearOpen(false)}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                disabled={clearing}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {clearing ? "Clearing..." : "Clear All"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Budget selector */}
        <div className="border-t border-border pt-4 space-y-2">
          <h3 className="text-sm font-medium">Storage limit</h3>
          <div className="space-y-1">
            {BUDGET_OPTIONS.map((opt) => (
              <button
                key={opt.bytes}
                onClick={() => handleBudgetChange(opt.bytes)}
                className="flex items-center gap-3 py-1.5 cursor-pointer group w-full text-left"
              >
                <span
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                    usage.budgetBytes === opt.bytes
                      ? "border-primary"
                      : "border-muted-foreground/40 group-hover:border-muted-foreground"
                  }`}
                >
                  {usage.budgetBytes === opt.bytes && (
                    <span className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </span>
                <span className="text-sm">
                  {opt.label}
                  {opt.recommended && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      (recommended)
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
