import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { StorageManager, StorageUsage, StorageManagerConfig } from '../services/storage-manager';
import { Prefetcher } from '../services/prefetcher';

interface StorageContextValue {
  manager: StorageManager;
  prefetcher: Prefetcher;
  usage: StorageUsage | null;
  refreshUsage: () => Promise<void>;
  clearCache: () => Promise<void>;
  setBudget: (bytes: number) => void;
  cellularEnabled: boolean;
  setCellularEnabled: (enabled: boolean) => void;
  isReady: boolean;
}

const STORAGE_KEY_CELLULAR = "blipp.prefetch.cellular.enabled";

const StorageContext = createContext<StorageContextValue | null>(null);

export function StorageProvider({
  children,
  config,
}: {
  children: React.ReactNode;
  config?: StorageManagerConfig;
}) {
  const managerRef = useRef<StorageManager | null>(null);
  const prefetcherRef = useRef<Prefetcher | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [cellularEnabled, setCellularEnabledState] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY_CELLULAR) === "true";
  });

  if (!managerRef.current) {
    managerRef.current = new StorageManager(config);
  }
  if (!prefetcherRef.current) {
    prefetcherRef.current = new Prefetcher(managerRef.current, { cellularEnabled });
  }

  const manager = managerRef.current;
  const prefetcher = prefetcherRef.current;

  useEffect(() => {
    let cancelled = false;
    manager.init().then(() => {
      if (!cancelled) {
        setIsReady(true);
        manager.getUsage().then((u) => !cancelled && setUsage(u));
      }
    });
    return () => {
      cancelled = true;
      prefetcher.dispose();
      manager.close();
    };
  }, [manager, prefetcher]);

  const refreshUsage = useCallback(async () => {
    const u = await manager.getUsage();
    setUsage(u);
  }, [manager]);

  const clearCache = useCallback(async () => {
    await manager.clearAll();
    await refreshUsage();
  }, [manager, refreshUsage]);

  const setBudget = useCallback(
    (bytes: number) => {
      manager.setBudget(bytes);
      refreshUsage();
    },
    [manager, refreshUsage],
  );

  const setCellularEnabled = useCallback(
    (enabled: boolean) => {
      setCellularEnabledState(enabled);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY_CELLULAR, String(enabled));
      }
      prefetcher.setCellularEnabled(enabled);
    },
    [prefetcher],
  );

  return (
    <StorageContext.Provider
      value={{
        manager,
        prefetcher,
        usage,
        refreshUsage,
        clearCache,
        setBudget,
        cellularEnabled,
        setCellularEnabled,
        isReady,
      }}
    >
      {children}
    </StorageContext.Provider>
  );
}

export function useStorage(): StorageContextValue {
  const ctx = useContext(StorageContext);
  if (!ctx) {
    throw new Error('useStorage must be used within a StorageProvider');
  }
  return ctx;
}

export { StorageContext };
