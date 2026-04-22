import { useEffect, useState, useCallback } from "react";
import {
  Sun, Moon, Monitor, Download, Trash2, LogOut, MapPin,
  User, Mic, Smartphone, ShieldCheck,
} from "lucide-react";
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
import { useIAP } from "../hooks/use-iap";
import { InterestPicker } from "../components/interest-picker";
import { SportsTeamPicker } from "../components/sports-team-picker";
import { ScrollableRow } from "../components/scrollable-row";
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
  zipCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
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

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "content", label: "Content", icon: Mic },
  { id: "app", label: "App", icon: Smartphone },
  { id: "account", label: "Account", icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Settings() {
  const apiFetch = useApiFetch();
  const { signOut } = useClerk();
  const { purchase, restore, ready: iapReady, error: iapError, loading: iapLoading, billingStatus } = useIAP();
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const { data: userData, loading: userLoading, refetch: refetchUser } = useFetch<{ user: UserInfo }>("/me");
  const { data: usageData, loading: usageLoading, refetch: refetchUsage } = useFetch<{ data: UsageData }>("/me/usage");

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

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub);
        });
      });
    }
  }, []);

  async function handleUpgrade(p: PlanDetail, interval: "monthly" | "annual") {
    setActionLoading(p.id);

    if (Capacitor.isNativePlatform()) {
      console.log("[upgrade] click", {
        planId: p.id,
        slug: p.slug,
        interval,
        iapReady,
        iapLoading,
        iapError,
        appleProductIdMonthly: p.appleProductIdMonthly,
        appleProductIdAnnual: p.appleProductIdAnnual,
      });
      if (!iapReady) {
        toast.error(
          iapError
            ? `In-App Purchase unavailable: ${iapError}`
            : "In-App Purchase is still initializing — try again in a moment"
        );
        setActionLoading(null);
        return;
      }
      const productId =
        interval === "annual" ? p.appleProductIdAnnual : p.appleProductIdMonthly;
      if (!productId) {
        toast.error(`No App Store product configured for ${interval} billing`);
        setActionLoading(null);
        return;
      }
      try {
        console.log("[upgrade] calling purchase", productId);
        const result = await purchase(productId);
        console.log("[upgrade] purchase returned", result);
        toast.success("Subscription activated");
        refetchUser();
        refetchUsage();
      } catch (e) {
        console.error("[upgrade] purchase failed", e);
        const msg = e instanceof Error ? e.message : String(e);
        if (!/cancel/i.test(msg)) toast.error(msg || "Purchase failed");
      } finally {
        setActionLoading(null);
      }
      return;
    }

    try {
      const { url } = await apiFetch<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId: p.id, interval }),
      });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start checkout");
      setActionLoading(null);
    }
  }

  async function handleManage() {
    setActionLoading("manage");

    // Apple subscribers need to manage their subscription via the App Store —
    // Stripe portal won't work for them and the server returns a 5xx if we try.
    if (billingStatus?.subscriptionSource === "APPLE") {
      const url = billingStatus.manageUrl ?? "https://apps.apple.com/account/subscriptions";
      try {
        if (Capacitor.isNativePlatform()) {
          const { Browser } = await import("@capacitor/browser");
          await Browser.open({ url });
        } else {
          window.location.href = url;
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to open App Store");
      } finally {
        setActionLoading(null);
      }
      return;
    }

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

  async function handleRestore() {
    setRestoreLoading(true);
    try {
      await restore();
      toast.success("Purchases restored");
      refetchUser();
      refetchUsage();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoreLoading(false);
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
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-1">Settings</h1>

      {/* Sticky tab bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab panels */}
      <div className="space-y-6 pt-1">
        {activeTab === "profile" && (
          <ProfileTab
            user={user}
            userLoading={userLoading}
            usage={usage}
            usageLoading={usageLoading}
            actionLoading={actionLoading}
            onUpgrade={handleUpgrade}
            onManage={handleManage}
          />
        )}
        {activeTab === "content" && (
          <ContentTab
            user={user}
            defaultTier={defaultTier}
            setDefaultTier={setDefaultTier}
            defaultVoicePresetId={defaultVoicePresetId}
            setDefaultVoicePresetId={setDefaultVoicePresetId}
            acceptAnyVoice={acceptAnyVoice}
            setAcceptAnyVoice={setAcceptAnyVoice}
            maxDurationMinutes={planUsage.maxDurationMinutes}
            apiFetch={apiFetch}
            refetchUser={refetchUser}
          />
        )}
        {activeTab === "app" && (
          <AppTab
            pushEnabled={pushEnabled}
            pushLoading={pushLoading}
            onTogglePush={togglePush}
            onRestore={handleRestore}
            restoreLoading={restoreLoading}
          />
        )}
        {activeTab === "account" && (
          <AccountTab
            exportLoading={exportLoading}
            onExport={handleExport}
            onDeleteOpen={() => setDeleteOpen(true)}
            onSignOut={async () => {
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
          />
        )}
      </div>

      {/* Delete account dialog (always mounted for state preservation) */}
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
    </div>
  );
}

/* ─── Profile Tab ─────────────────────────────────────────── */

function ProfileTab({
  user,
  userLoading,
  usage,
  usageLoading,
  actionLoading,
  onUpgrade,
  onManage,
}: {
  user: UserInfo | null;
  userLoading: boolean;
  usage: UsageData | null;
  usageLoading: boolean;
  actionLoading: string | null;
  onUpgrade: (p: PlanDetail, interval: "monthly" | "annual") => void;
  onManage: () => void;
}) {
  return (
    <>
      {/* Account */}
      <SettingsGroup title="Account">
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
      </SettingsGroup>

      {/* Usage */}
      <SettingsGroup title="Usage">
        {usageLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ) : usage ? (
          <div className="space-y-4">
            <UsageMeter label="Briefings" used={usage.briefingsUsed} limit={usage.briefingsLimit} />
            <UsageMeter label="Subscriptions" used={usage.subscriptionsUsed} limit={usage.subscriptionsLimit} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Failed to load usage data</p>
        )}
      </SettingsGroup>

      {/* Plans */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Plans</h2>
        {!user ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <PlanComparison
            currentPlanSlug={user.plan.slug}
            subscriptionEndsAt={user.subscriptionEndsAt}
            onUpgrade={onUpgrade}
            onManage={onManage}
            actionLoading={actionLoading}
          />
        )}
      </section>
    </>
  );
}

/* ─── Content Tab ─────────────────────────────────────────── */

function ContentTab({
  user,
  defaultTier,
  setDefaultTier,
  defaultVoicePresetId,
  setDefaultVoicePresetId,
  acceptAnyVoice,
  setAcceptAnyVoice,
  maxDurationMinutes,
  apiFetch,
  refetchUser,
}: {
  user: UserInfo | null;
  defaultTier: number | null;
  setDefaultTier: (v: number | null) => void;
  defaultVoicePresetId: string | null;
  setDefaultVoicePresetId: (v: string | null) => void;
  acceptAnyVoice: boolean | null;
  setAcceptAnyVoice: (v: boolean | null) => void;
  maxDurationMinutes: number;
  apiFetch: ReturnType<typeof useApiFetch>;
  refetchUser: () => void;
}) {
  return (
    <>
      {/* Default Duration */}
      <SettingsGroup title="Default Blipp Duration">
        <p className="text-xs text-muted-foreground mb-2">
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
          maxDurationMinutes={maxDurationMinutes}
        />
      </SettingsGroup>

      {/* Default Voice */}
      <SettingsGroup title="Default Voice">
        <p className="text-xs text-muted-foreground mb-2">
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
      </SettingsGroup>

      {/* Voice Delivery */}
      <SettingsGroup title="Voice Delivery">
        <ToggleRow
          label="Accept any available voice"
          description="Get briefings faster by accepting any cached voice instead of waiting for your preferred one"
          checked={!!acceptAnyVoice}
          onToggle={async () => {
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
        />
      </SettingsGroup>

      {/* Interests */}
      {user && (
        <SettingsGroup title="Your Interests">
          <OptimisticInterestPicker user={user} apiFetch={apiFetch} refetchUser={refetchUser} />
        </SettingsGroup>
      )}

      {/* Location */}
      <SettingsGroup title="Location">
        <p className="text-xs text-muted-foreground mb-3">
          Enter your zip code for local sports and podcast recommendations.
        </p>
        <ZipCodeInput user={user} apiFetch={apiFetch} refetchUser={refetchUser} />
      </SettingsGroup>

      {/* Sports Teams */}
      <SettingsGroup title="Sports Teams">
        <p className="text-xs text-muted-foreground mb-3">
          Follow teams to boost related podcast recommendations.
        </p>
        <SportsTeamPicker />
      </SettingsGroup>
    </>
  );
}

/* ─── Zip Code Input ─────────────────────────────────────── */

function ZipCodeInput({
  user,
  apiFetch,
  refetchUser,
}: {
  user: UserInfo | null;
  apiFetch: ReturnType<typeof useApiFetch>;
  refetchUser: () => void;
}) {
  const [zip, setZip] = useState(user?.zipCode ?? "");
  const [saving, setSaving] = useState(false);

  const handleBlur = async () => {
    // Only submit if it's a valid 5-digit zip and different from current
    if (!/^\d{5}$/.test(zip)) return;
    if (zip === user?.zipCode) return;

    setSaving(true);
    try {
      await apiFetch("/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({ zipCode: zip }),
      });
      toast.success("Location updated");
      refetchUser();
    } catch {
      toast.error("Invalid zip code");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await apiFetch("/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({ zipCode: null }),
      });
      setZip("");
      toast.success("Location cleared");
      refetchUser();
    } catch {
      toast.error("Failed to clear location");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="Enter zip code"
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            onBlur={handleBlur}
            onKeyDown={(e) => { if (e.key === "Enter") handleBlur(); }}
            disabled={saving}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        {user?.zipCode && (
          <button
            onClick={handleClear}
            disabled={saving}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
      {user?.city && user?.state && (
        <p className="text-xs text-muted-foreground pl-1">
          {user.city}, {user.state}{user.country && user.country !== "US" ? `, ${user.country}` : ""}
        </p>
      )}
    </div>
  );
}

/* ─── App Tab ─────────────────────────────────────────────── */

function AppTab({
  pushEnabled,
  pushLoading,
  onTogglePush,
  onRestore,
  restoreLoading,
}: {
  pushEnabled: boolean;
  pushLoading: boolean;
  onTogglePush: () => void;
  onRestore: () => void;
  restoreLoading: boolean;
}) {
  const isNative = Capacitor.isNativePlatform();
  return (
    <>
      {/* Appearance */}
      <SettingsGroup title="Appearance">
        <ThemeSelector />
      </SettingsGroup>

      {/* Card Artwork */}
      <AppConfigSection />

      {/* Notifications */}
      <SettingsGroup title="Notifications">
        <ToggleRow
          label="Push Notifications"
          description="Get notified when briefings are ready"
          checked={pushEnabled}
          disabled={pushLoading}
          onToggle={onTogglePush}
        />
      </SettingsGroup>

      {/* Subscription */}
      {isNative && (
        <SettingsGroup title="Subscription">
          <button
            onClick={onRestore}
            disabled={restoreLoading}
            className="w-full flex items-center justify-between text-left disabled:opacity-50"
          >
            <div>
              <p className="text-sm font-medium">Restore Purchases</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Re-link App Store purchases made with your Apple ID
              </p>
            </div>
            <span className="text-sm text-primary font-semibold shrink-0 ml-3">
              {restoreLoading ? "Restoring..." : "Restore"}
            </span>
          </button>
        </SettingsGroup>
      )}

      {/* Storage */}
      <StorageSettings />
    </>
  );
}

/* ─── Account Tab ─────────────────────────────────────────── */

function AccountTab({
  exportLoading,
  onExport,
  onDeleteOpen,
  onSignOut,
}: {
  exportLoading: boolean;
  onExport: () => void;
  onDeleteOpen: () => void;
  onSignOut: () => void;
}) {
  return (
    <>
      {/* Data & Privacy */}
      <SettingsGroup title="Data & Privacy">
        <div className="space-y-3">
          <button
            onClick={onExport}
            disabled={exportLoading}
            className="flex items-center gap-2 text-sm text-foreground hover:text-foreground/80 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exportLoading ? "Exporting..." : "Export My Data"}
          </button>
          <div className="border-t border-border" />
          <button
            onClick={onDeleteOpen}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
        </div>
      </SettingsGroup>

      {/* About */}
      <SettingsGroup title="About">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Version</span>
            <span className="text-sm font-mono">{__APP_VERSION__}</span>
          </div>
          <div className="border-t border-border" />
          <Link
            to="/support"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Contact Support
          </Link>
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
      </SettingsGroup>

      {/* Sign Out */}
      <section>
        <button
          onClick={onSignOut}
          className="w-full bg-card border border-border rounded-xl p-4 text-red-500 hover:text-red-400 font-medium transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </section>
    </>
  );
}

/* ─── Shared Components ───────────────────────────────────── */

function OptimisticInterestPicker({
  user,
  apiFetch,
  refetchUser,
}: {
  user: UserInfo;
  apiFetch: ReturnType<typeof useApiFetch>;
  refetchUser: () => void;
}) {
  const [interests, setInterests] = useState({
    preferredCategories: user.preferredCategories ?? [],
    excludedCategories: user.excludedCategories ?? [],
    preferredTopics: user.preferredTopics ?? [],
    excludedTopics: user.excludedTopics ?? [],
  });

  // Sync from server when user data changes (e.g. after refetch from another tab)
  const userKey = JSON.stringify([
    user.preferredCategories,
    user.excludedCategories,
    user.preferredTopics,
    user.excludedTopics,
  ]);
  useEffect(() => {
    setInterests({
      preferredCategories: user.preferredCategories ?? [],
      excludedCategories: user.excludedCategories ?? [],
      preferredTopics: user.preferredTopics ?? [],
      excludedTopics: user.excludedTopics ?? [],
    });
  }, [userKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <InterestPicker
      {...interests}
      onChange={async (prefs) => {
        const prev = interests;
        setInterests(prefs);
        try {
          await apiFetch("/me/preferences", {
            method: "PATCH",
            body: JSON.stringify(prefs),
          });
          refetchUser();
        } catch {
          setInterests(prev);
          toast.error("Failed to update interests");
        }
      }}
    />
  );
}

function TabBar({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (id: TabId) => void }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-3 bg-background">
      <ScrollableRow className="gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => onTabChange(id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
              activeTab === id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </ScrollableRow>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{title}</h2>
      <div className="bg-card border border-border rounded-xl p-4">
        {children}
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${checked ? "translate-x-5 bg-primary-foreground" : "bg-muted-foreground"}`}
        />
      </button>
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
  { value: 100, label: "S" },
  { value: 120, label: "M" },
  { value: 140, label: "L" },
];

function AppConfigSection() {
  const [config, updateConfig] = useAppConfig();

  return (
    <SettingsGroup title="Card Artwork Size">
      <p className="text-xs text-muted-foreground mb-2">
        Adjust the artwork size on podcast and episode cards.
      </p>
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
    </SettingsGroup>
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
  );
}
