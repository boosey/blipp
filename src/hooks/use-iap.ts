import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useUser } from "@clerk/clerk-react";
import {
  initIAP,
  getCurrentOffering,
  purchaseProduct,
  restorePurchases,
  type IAPOffering,
  type PurchaseResult,
} from "@/lib/iap";
import { useApiFetch } from "@/lib/api";

export type BillingSource = "STRIPE" | "APPLE";

export interface BillingStatus {
  activeSources: BillingSource[];
  canPurchaseIAP: boolean;
  subscriptionSource: BillingSource | null;
  manageUrl: string | null;
}

interface UseIAPState {
  ready: boolean;
  offering: IAPOffering | null;
  billingStatus: BillingStatus | null;
  loading: boolean;
  error: string | null;
}

/**
 * Unified IAP hook for native iOS clients. Initializes RevenueCat once the
 * Clerk user is known, loads the current offering + cross-channel billing status,
 * and exposes purchase / restore helpers that notify the server afterward.
 *
 * On web, `ready` stays false and no offering is loaded — callers on web should
 * fall back to the Stripe checkout flow.
 */
export function useIAP() {
  const { user, isLoaded } = useUser();
  const apiFetch = useApiFetch();
  const initializedRef = useRef(false);
  const [state, setState] = useState<UseIAPState>({
    ready: false,
    offering: null,
    billingStatus: null,
    loading: false,
    error: null,
  });

  const loadBillingStatus = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: BillingStatus }>("/iap/billing-status");
      setState((s) => ({ ...s, billingStatus: res.data }));
    } catch (err) {
      console.warn("[iap] billing-status failed", err);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (!isLoaded || !user) return;
    if (!Capacitor.isNativePlatform()) {
      void loadBillingStatus();
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        await initIAP(user.id);
        const [offering] = await Promise.all([getCurrentOffering(), loadBillingStatus()]);
        setState((s) => ({ ...s, offering, ready: true, loading: false }));
      } catch (err) {
        console.error("[iap] init failed", err);
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "IAP init failed",
        }));
      }
    })();
  }, [isLoaded, user, loadBillingStatus]);

  const purchase = useCallback(
    async (productId: string): Promise<PurchaseResult> => {
      const result = await purchaseProduct(productId);
      try {
        await apiFetch("/iap/link", {
          method: "POST",
          body: JSON.stringify({
            productId: result.productIdentifier,
            originalTransactionId: result.originalTransactionId ?? result.productIdentifier,
          }),
        });
      } catch (err) {
        console.warn("[iap] /iap/link failed (webhook will reconcile)", err);
      }
      await loadBillingStatus();
      return result;
    },
    [apiFetch, loadBillingStatus]
  );

  const restore = useCallback(async () => {
    await restorePurchases();
    await apiFetch("/iap/restore", { method: "POST" }).catch(() => undefined);
    await loadBillingStatus();
  }, [apiFetch, loadBillingStatus]);

  return {
    ...state,
    purchase,
    restore,
    refreshBillingStatus: loadBillingStatus,
  };
}
