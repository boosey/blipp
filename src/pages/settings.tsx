import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { toast } from "sonner";
import { useApiFetch } from "../lib/api";
import { Skeleton } from "../components/ui/skeleton";
import { PlanComparison, type PlanDetail } from "../components/plan-comparison";
import { useTheme, type Theme } from "../contexts/theme-context";

interface PlanInfo {
  id: string;
  name: string;
  slug: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

/** Settings page for subscription management. */
export function Settings() {
  const apiFetch = useApiFetch();
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ user: { plan: PlanInfo } }>("/me")
      .then((r) => setPlan(r.user.plan))
      .catch(() => toast.error("Failed to load account info"));
  }, [apiFetch]);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub);
        });
      });
    }
  }, []);

  async function handleUpgrade(p: PlanDetail) {
    setActionLoading(p.id);
    try {
      const { url } = await apiFetch<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId: p.id, interval: "monthly" }),
      });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start checkout");
      setActionLoading(null);
    }
  }

  async function handleManage() {
    setActionLoading("manage");
    try {
      const { url } = await apiFetch<{ url: string }>("/billing/portal", {
        method: "POST",
      });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open billing portal");
      setActionLoading(null);
    }
  }

  async function togglePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Push notifications not supported in this browser");
      return;
    }

    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await apiFetch("/me/push/subscribe", {
            method: "DELETE",
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
        toast.success("Push notifications disabled");
      } else {
        const { data } = await apiFetch<{ data: { publicKey: string } }>("/me/push/vapid-key");
        if (!data?.publicKey) {
          toast.error("Push notifications not available yet");
          return;
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.publicKey).buffer as ArrayBuffer,
        });

        const keys = sub.toJSON().keys!;
        await apiFetch("/me/push/subscribe", {
          method: "POST",
          body: JSON.stringify({
            endpoint: sub.endpoint,
            keys: { p256dh: keys.p256dh, auth: keys.auth },
          }),
        });

        setPushEnabled(true);
        toast.success("Push notifications enabled");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle notifications");
    } finally {
      setPushLoading(false);
    }
  }

  return (
    <div className="max-w-lg space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Plans</h2>
        {!plan ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <PlanComparison
            currentPlanSlug={plan.slug}
            onUpgrade={handleUpgrade}
            onManage={handleManage}
            actionLoading={actionLoading}
          />
        )}
      </div>

      {/* Appearance */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <ThemeSelector />
      </div>

      {/* Push Notifications */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Push Notifications</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Get notified when briefings are ready</p>
          </div>
          <button
            onClick={togglePush}
            disabled={pushLoading}
            className={`relative w-11 h-6 rounded-full transition-colors ${pushEnabled ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${pushEnabled ? "translate-x-5 bg-primary-foreground" : "bg-muted-foreground"}`} />
          </button>
        </div>
      </div>
    </div>
  );
}

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex gap-2">
        {themeOptions.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
              theme === value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
