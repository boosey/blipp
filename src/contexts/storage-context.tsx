import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { StorageManager, StorageUsage, StorageManagerConfig } from '../services/storage-manager';

interface StorageContextValue {
  manager: StorageManager;
  usage: StorageUsage | null;
  refreshUsage: () => Promise<void>;
  clearCache: () => Promise<void>;
  setBudget: (bytes: number) => void;
  isReady: boolean;
}

const StorageContext = createContext<StorageContextValue | null>(null);

export function StorageProvider({
  children,
  config,
}: {
  children: React.ReactNode;
  config?: StorageManagerConfig;
}) {
  const managerRef = useRef<StorageManager | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [usage, setUsage] = useState<StorageUsage | null>(null);

  if (!managerRef.current) {
    managerRef.current = new StorageManager(config);
  }

  const manager = managerRef.current;

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
      manager.close();
    };
  }, [manager]);

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

  return (
    <StorageContext.Provider
      value={{ manager, usage, refreshUsage, clearCache, setBudget, isReady }}
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
