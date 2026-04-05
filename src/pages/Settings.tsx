import { useEffect, useState, useCallback } from "react";
import { Sun, Moon, Monitor, Download, Trash2, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useClerk } from "@clerk/clerk-react";
import { Capacitor } from "@capacitor/core";
import { registerPlugin } from "@capacitor/core";
import { useApiFetch } from "../lib/api";
import { useFetch } from "../lib/use-fetch";
import { Skeleton } from "../components/ui/skeleton";
import { PlanComparison, type PlanDetail } from "../components/plan-comparison";
import { TierPicker } from "../components/tier-picker";
import { VoicePresetPicker } from "../components/voice-preset-picker";
import { useTheme, type Theme } from "../contexts/theme-context";
import { usePlan } from "../contexts/plan-context";
import { useAppConfig } from "../lib/app-config";
import { StorageSettings } from "../components/storage-settings";
import { InterestPicker } from "../components/interest-picker";
import { SportsTeamPicker } from "../components/sports-team-picker";
import type { DurationTier } from "../lib/duration-tiers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/ui/dialog";

declare const __APP_VERSION__: string;

interface UserInfo {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  plan: { id: string; name: string; slug: string };
  subscriptionEndsAt: string | null;
  isAdmin: boolean;
  defaultDurationTier: number;
  defaultVoicePresetId: string | null;
  acceptAnyVoice: boolean;
  preferredCategories: string[];
  excludedCategories: string[];
  preferredTopics: string[];
  excludedTopics: string[];
  profileCompletedAt: string | null;
}

interface UsageData {
  briefingsUsed: number;
  briefingsLimit: number | null;
  subscriptionsUsed: number;
  subscriptionsLimit: number | null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

export function Settings() {
  const apiFetch = useApiFetch();
  const { signOut } = useClerk();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const { data: userData, loading: userLoading, refetch: refetchUser } = useFetch<{ user: UserInfo }>("/me");
  const { data: usageData, loading: usageLoading, refetch: refetchUsage } = useFetch<{ data: UsageData }>("/me/usage");

  // Re-fetch user/usage when returning from Stripe portal or checkout
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refetchUser();
        refetchUsage();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetchUser, refetchUsage]);
  const planUsage = usePlan();
  const [defaultTier, setDefaultTier] = useState<number | null>(null);
  const [defaultVoicePresetId, setDefaultVoicePresetId] = useState<string | null>(null);
  const [acceptAnyVoice, setAcceptAnyVoice] = useState<boolean | null>(null);

  const user = userData?.user ?? null;

  // Sync defaults from user data
  useEffect(() => {
    if (user && defaultTier === null) {
      setDefaultTier(user.defaultDurationTier);
    }
    if (user && defaultVoicePresetId === null) {
      setDefaultVoicePresetId(user.defaultVoicePresetId ?? null);
    }
    if (user && acceptAnyVoice === null) {
      setAcceptAnyVoice(user.acceptAnyVoice ?? false);
    }
  }, [user, defaultTier, defaultVoicePresetId, acceptAnyVoice]);
  const usage = usageData?.data ?? null;

  // Check push state on mount
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

  async function handleExport() {
    setExportLoading(true);
    try {
      const data = await apiFetch<Record<string, unknown>>("/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "blipp-data-export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Data exported successfully");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to export data");
    } finally {
      setExportLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== "DELETE") return;
    setDeleteLoading(true);
    try {
      await apiFetch("/me", {
        method: "DELETE",
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      toast.success("Account deleted");
      signOut({ redirectUrl: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete account");
      setDeleteLoading(false);
    }
  }

  return (
    <div className="max-w-lg space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Account */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Account</h2>
        <div className="bg-card border border-border rounded-xl p-4">
          {userLoading ? (
            <div className="flex items-center gap-3">
              <Skeleton className="w-12 h-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ) : user ? (
            <div className="flex items-center gap-3">
              {user.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt={user.name ?? "Avatar"}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-lg font-semibold">
                  {(user.name ?? user.email)?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}
              <div>
                <p className="font-bold">{user.name ?? "Blipp User"}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Failed to load account info</p>
          )}
        </div>
      </section>

      {/* Usage */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Usage</h2>
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          {usageLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ) : usage ? (
            <>
              <UsageMeter
                label="Briefings"
                used={usage.briefingsUsed}
                limit={usage.briefingsLimit}
              />
              <UsageMeter
                label="Subscriptions"
                used={usage.subscriptionsUsed}
                limit={usage.subscriptionsLimit}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Failed to load usage data</p>
          )}
        </div>
      </section>

      {/* Plans */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Plans</h2>
        {!user ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <PlanComparison
            currentPlanSlug={user.plan.slug}
            subscriptionEndsAt={user.subscriptionEndsAt}
            onUpgrade={handleUpgrade}
            onManage={handleManage}
            actionLoading={actionLoading}
          />
        )}
      </section>

      {/* Appearance */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <ThemeSelector />
      </section>

      {/* App Config */}
      <AppConfigSection />

      {/* Push Notifications */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Push Notifications</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Get notified when briefings are ready
              </p>
            </div>
            <button
              onClick={togglePush}
              disabled={pushLoading}
              className={`relative w-11 h-6 rounded-full transition-colors ${pushEnabled ? "bg-primary" : "bg-muted"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${pushEnabled ? "translate-x-5 bg-primary-foreground" : "bg-muted-foreground"}`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Storage & Downloads */}
      <StorageSettings />

      {/* Default Blipp Duration */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Default Blipp Duration</h2>
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Tap a duration to set your default. The Blipp button will use this length.
          </p>
          <TierPicker
            selected={(defaultTier ?? 5) as DurationTier}
            onSelect={async (tier) => {
              const prev = defaultTier;
              setDefaultTier(tier);
              try {
                await apiFetch("/me/preferences", {
                  method: "PATCH",
                  body: JSON.stringify({ defaultDurationTier: tier }),
                });
                toast.success(`Default duration set to ${tier} minutes`);
              } catch {
                setDefaultTier(prev);
                toast.error("Failed to update preference");
              }
            }}
            maxDurationMinutes={planUsage.maxDurationMinutes}
          />
        </div>
      </section>

      {/* Default Voice */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Default Voice</h2>
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Choose the default voice style for your briefings.
          </p>
          <VoicePresetPicker
            selected={defaultVoicePresetId}
            onSelect={async (presetId) => {
              const prev = defaultVoicePresetId;
              setDefaultVoicePresetId(presetId);
              try {
                await apiFetch("/me/preferences", {
                  method: "PATCH",
                  body: JSON.stringify({ defaultVoicePresetId: presetId }),
                });
                toast.success("Default voice updated");
              } catch {
                setDefaultVoicePresetId(prev);
                toast.error("Failed to update preference");
              }
            }}
          />
        </div>
      </section>

      {/* Your Interests */}
      {user && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Your Interests</h2>
          <div className="bg-card border border-border rounded-xl p-4">
            <InterestPicker
              preferredCategories={user.preferredCategories ?? []}
              excludedCategories={user.excludedCategories ?? []}
              preferredTopics={user.preferredTopics ?? []}
              excludedTopics={user.excludedTopics ?? []}
              onChange={async (prefs) => {
                try {
                  await apiFetch("/me/preferences", {
                    method: "PATCH",
                    body: JSON.stringify(prefs),
                  });
                  toast.success("Interests updated");
                  refetchUser();
                } catch {
                  toast.error("Failed to update interests");
                }
              }}
            />
          </div>
        </section>
      )}

      {/* Sports Teams */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Sports Teams</h2>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-3">
            Follow teams to boost related podcast recommendations.
          </p>
          <SportsTeamPicker />
        </div>
      </section>

      {/* Voice Bypass */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Voice Delivery</h2>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Accept any available voice</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Get briefings faster by accepting any cached voice instead of waiting for your preferred one
              </p>
            </div>
            <button
              onClick={async () => {
                const prev = acceptAnyVoice;
                const next = !prev;
                setAcceptAnyVoice(next);
                try {
                  await apiFetch("/me/preferences", {
                    method: "PATCH",
                    body: JSON.stringify({ acceptAnyVoice: next }),
                  });
                  toast.success(next ? "Voice bypass enabled" : "Voice bypass disabled");
                } catch {
                  setAcceptAnyVoice(prev);
                  toast.error("Failed to update preference");
                }
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${acceptAnyVoice ? "bg-primary" : "bg-muted"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${acceptAnyVoice ? "translate-x-5 bg-primary-foreground" : "bg-muted-foreground"}`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Data & Privacy */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Data & Privacy</h2>
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <button
            onClick={handleExport}
            disabled={exportLoading}
            className="flex items-center gap-2 text-sm text-foreground hover:text-foreground/80 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exportLoading ? "Exporting..." : "Export My Data"}
          </button>
          <div className="border-t border-border" />
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
        </div>

        <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteConfirm(""); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Account</DialogTitle>
              <DialogDescription>
                This action is permanent and cannot be undone. All your data, briefings,
                and subscriptions will be permanently deleted.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Type <span className="font-mono font-bold">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <DialogFooter>
              <button
                onClick={() => { setDeleteOpen(false); setDeleteConfirm(""); }}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== "DELETE" || deleteLoading}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading ? "Deleting..." : "Delete My Account"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      {/* About */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">About</h2>
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Version</span>
            <span className="text-sm font-mono">{__APP_VERSION__}</span>
          </div>
          <div className="border-t border-border" />
          <Link
            to="/tos"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Terms of Service
          </Link>
          <Link
            to="/privacy"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
        </div>
      </section>

      {/* Sign Out */}
      <section>
        <button
          onClick={async () => {
            // Sign out of native social login providers on mobile
            if (Capacitor.isNativePlatform()) {
              try {
                const SocialLogin: any = registerPlugin("SocialLogin");
                await SocialLogin.logout({ provider: "google" });
              } catch (e) {
                // Ignore — may not be signed in via Google
              }
            }
            signOut({ redirectUrl: "/" });
          }}
          className="w-full bg-card border border-border rounded-xl p-4 text-red-500 hover:text-red-400 font-medium transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </section>
    </div>
  );
}

function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {used} / {limit ?? "Unlimited"}
        </span>
      </div>
      {limit != null ? (
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Unlimited</p>
      )}
    </div>
  );
}

const ARTWORK_SIZES: { value: number; label: string }[] = [
  { value: 100, label: "XS" },
  { value: 120, label: "S" },
  { value: 140, label: "M" },
  { value: 160, label: "L" },
  { value: 180, label: "XL" },
];

function AppConfigSection() {
  const [config, updateConfig] = useAppConfig();

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">App Config</h2>
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div>
          <h3 className="text-sm font-medium">Card Artwork Size</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Adjust the artwork size on podcast and episode cards.
          </p>
        </div>
        <div className="flex gap-2">
          {ARTWORK_SIZES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => updateConfig({ artworkSize: value })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                config.artworkSize === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
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
