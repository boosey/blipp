import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";

let initialized = false;
let initializing: Promise<void> | null = null;

/**
 * Configure RevenueCat with the Apple API key and link the current Clerk user.
 * Safe to call multiple times — subsequent calls are a no-op unless the user changes.
 * Only has any effect on a native iOS/Android platform.
 */
export async function initIAP(clerkUserId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const rawKey = import.meta.env.VITE_REVENUECAT_APPLE_API_KEY as string | undefined;
  const apiKey = rawKey?.trim();
  if (!apiKey) {
    console.warn("[iap] VITE_REVENUECAT_APPLE_API_KEY not set; IAP disabled on native");
    return;
  }
  console.log("[iap] initIAP starting for user", clerkUserId, "keyPrefix", apiKey.slice(0, 6));

  if (initialized) {
    await Purchases.logIn({ appUserID: clerkUserId });
    return;
  }

  if (initializing) return initializing;
  initializing = (async () => {
    console.log("[iap] calling configure()");
    await Purchases.configure({ apiKey, appUserID: clerkUserId });
    console.log("[iap] configure() resolved");
    initialized = true;
    console.log("[iap] initIAP configured");
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
  console.log("[iap] purchaseProduct start", productId);
  console.log("[iap] getting offerings");
  const offerings: any = await Purchases.getOfferings();
  const offeringIds = Object.keys(offerings?.all ?? {});
  console.log("[iap] offerings received", {
    currentId: offerings?.current?.identifier,
    offeringIds,
  });

  let pkg: any = null;
  for (const key of offeringIds) {
    const o = offerings.all[key];
    const candidates = [o.monthly, o.annual, ...(o.availablePackages ?? [])].filter(Boolean);
    pkg = candidates.find((p: any) => p?.product?.identifier === productId) ?? null;
    if (pkg) break;
  }
  if (!pkg) throw new Error(`Product ${productId} not found in any offering`);

  console.log("[iap] calling purchasePackage", pkg?.identifier);
  const result: any = await Purchases.purchasePackage({ aPackage: pkg as any });
  console.log("[iap] purchasePackage resolved");
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
  await Purchases.restorePurchases();
}

export async function logoutIAP(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !initialized) return;
  await Purchases.logOut();
  initialized = false;
}
