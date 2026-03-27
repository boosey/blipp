import { useSyncExternalStore } from "react";

const STORAGE_KEY = "blipp-app-config";

interface AppConfig {
  artworkSize: number; // px, used for compact card artwork height & width
}

const DEFAULTS: AppConfig = {
  artworkSize: 140,
};

function getSnapshot(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let listeners: Array<() => void> = [];
let cachedSnapshot = getSnapshot();

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function notify() {
  cachedSnapshot = getSnapshot();
  for (const cb of listeners) cb();
}

// Listen for changes from other tabs
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) notify();
  });
}

export function useAppConfig(): [AppConfig, (patch: Partial<AppConfig>) => void] {
  const config = useSyncExternalStore(subscribe, () => cachedSnapshot);

  function update(patch: Partial<AppConfig>) {
    const next = { ...config, ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notify();
  }

  return [config, update];
}
