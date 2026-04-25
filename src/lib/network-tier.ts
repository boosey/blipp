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

export function getNetworkTier(): NetworkTier {
  if (typeof navigator === "undefined") return "cellular";
  const nav = navigator as NavigatorWithConnection;
  if (nav.onLine === false) return "offline";

  const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  if (!conn) return "cellular"; // conservative default (e.g., iOS Safari/WebKit)

  if (conn.type === "wifi" || conn.type === "ethernet") return "wifi";
  if (conn.type === "cellular") return "cellular";

  // Type missing — heuristic on effectiveType
  if (conn.effectiveType === "4g") return "wifi";
  return "cellular";
}
