import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";

export type NetworkTier = "wifi" | "cellular" | "offline";

interface NetworkInformationLike {
  type?: string;
  effectiveType?: string;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
}

export async function getNetworkTier(): Promise<NetworkTier> {
  if (Capacitor.isNativePlatform()) {
    const status = await Network.getStatus();
    if (!status.connected) return "offline";
    if (status.connectionType === "wifi") return "wifi";
    if (status.connectionType === "cellular") return "cellular";
    // ethernet / unknown — treat as wifi-class
    return "wifi";
  }

  if (typeof navigator === "undefined") return "cellular";
  const nav = navigator as NavigatorWithConnection;
  if (nav.onLine === false) return "offline";

  const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  if (!conn) return "cellular"; // conservative default for browsers without the API

  if (conn.type === "wifi" || conn.type === "ethernet") return "wifi";
  if (conn.type === "cellular") return "cellular";

  // Type missing — heuristic on effectiveType
  if (conn.effectiveType === "4g") return "wifi";
  return "cellular";
}
