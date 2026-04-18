import { Capacitor } from "@capacitor/core";

let initialized = false;
let initializing: Promise<void> | null = null;

async function loadRC() {
  const mod = await import("@revenuecat/purchases-capacitor");
  return mod.Purchases;
}

/**
 * Configure RevenueCat with the Apple API key and link the current Clerk user.
 * Safe to call multiple times — subsequent calls are a no-op unless the user changes.
 * Only has any effect on a native iOS/Android platform.
 */
export async function initIAP(clerkUserId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const apiKey = import.meta.env.VITE_REVENUECAT_APPLE_API_KEY as string | undefined;
  if (!apiKey) {
    console.warn("[iap] VITE_REVENUECAT_APPLE_API_KEY not set; IAP disabled on native");
    return;
  }

  if (initialized) {
    const Purchases = await loadRC();
    await Purchases.logIn({ appUserID: clerkUserId });
    return;
  }

  if (initializing) return initializing;
  initializing = (async () => {
    const Purchases = await loadRC();
    await Purchases.configure({ apiKey, appUserID: clerkUserId });
    initialized = true;
  })();
  return initializing;
}

export interface IAPProduct {
  identifier: string;
  title: string;
  description: string;
  priceString: string;
  price: number;
  currencyCode: string;
}

export interface IAPOffering {
  identifier: string;
  serverDescription: string;
  monthly: IAPProduct | null;
  annual: IAPProduct | null;
}

export async function getCurrentOffering(): Promise<IAPOffering | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const Purchases = await loadRC();
  const { current } = await Purchases.getOfferings();
  if (!current) return null;
  const toProduct = (pkg: any): IAPProduct | null => {
    if (!pkg) return null;
    const p = pkg.product;
    return {
      identifier: p.identifier,
      title: p.title,
      description: p.description,
      priceString: p.priceString,
      price: p.price,
      currencyCode: p.currencyCode,
    };
  };
  return {
    identifier: current.identifier,
    serverDescription: current.serverDescription,
    monthly: toProduct(current.monthly),
    annual: toProduct(current.annual),
  };
}

export interface PurchaseResult {
  productIdentifier: string;
  originalTransactionId: string | null;
}

/**
 * Purchase a product by its Apple product identifier.
 * Throws on user cancellation or StoreKit error.
 */
export async function purchaseProduct(productId: string): Promise<PurchaseResult> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("IAP is only available on native iOS/Android");
  }
  const Purchases = await loadRC();
  const { current } = await Purchases.getOfferings();
  if (!current) throw new Error("No current RevenueCat offering available");

  let pkg =
    (current.monthly?.product?.identifier === productId && current.monthly) ||
    (current.annual?.product?.identifier === productId && current.annual);
  if (!pkg) {
    const all = [current.monthly, current.annual, ...current.availablePackages].filter(Boolean);
    pkg = all.find((p: any) => p?.product?.identifier === productId) ?? null;
  }
  if (!pkg) throw new Error(`Product ${productId} not found in current offering`);

  const result: any = await Purchases.purchasePackage({ aPackage: pkg as any });
  const subs = result?.customerInfo?.allPurchasedProductIdentifiers ?? [];
  const entry = result?.customerInfo?.activeSubscriptions?.[0] ?? subs[0] ?? productId;
  const originalTransactionId =
    result?.customerInfo?.subscriptions?.[entry]?.originalPurchaseDate ??
    result?.customerInfo?.latestExpirationDate ??
    null;
  return {
    productIdentifier: productId,
    originalTransactionId:
      typeof originalTransactionId === "string" ? originalTransactionId : null,
  };
}

export async function restorePurchases(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const Purchases = await loadRC();
  await Purchases.restorePurchases();
}

export async function logoutIAP(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !initialized) return;
  const Purchases = await loadRC();
  await Purchases.logOut();
  initialized = false;
}
