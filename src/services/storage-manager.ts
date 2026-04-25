import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { getApiBase } from '../lib/api-base';

// --- Types ---

export interface CachedBlippEntry {
  briefingId: string;
  cachedAt: number; // epoch ms
  sizeBytes: number;
  listenedAt: number | null; // epoch ms, null if never listened
  expiresAt: number | null; // epoch ms, null if no expiry
}

export interface StorageUsage {
  usedBytes: number;
  budgetBytes: number;
  entryCount: number;
}

export interface StorageManagerConfig {
  budgetBytes?: number;
  dbName?: string;
  storeName?: string;
  /** Returns the current Clerk session JWT, or null if signed out. */
  getToken?: () => Promise<string | null>;
}

// --- Constants ---

const DEFAULT_BUDGET_BYTES = 500 * 1024 * 1024; // 500MB
const DB_NAME = 'blipp-storage';
const MANIFEST_STORE = 'manifest';
const DB_VERSION = 1;
const LISTENED_EVICTION_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_DIR = 'blipp-cache';

// --- IndexedDB helpers ---

function openManifestDB(
  dbName: string,
  storeName: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'briefingId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(
  db: IDBDatabase,
  store: string,
  key: string,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut<T>(db: IDBDatabase, store: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function idbClear(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- File storage adapter ---

const isNative = Capacitor.isNativePlatform();

async function writeBlob(briefingId: string, blob: Blob): Promise<void> {
  if (isNative) {
    const buffer = await blob.arrayBuffer();
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(buffer)),
    );
    await Filesystem.writeFile({
      path: `${CACHE_DIR}/${briefingId}.audio`,
      data: base64,
      directory: Directory.Data,
    });
  } else {
    const cache = await caches.open(DB_NAME);
    const response = new Response(blob);
    await cache.put(`/blipp-audio/${briefingId}`, response);
  }
}

async function readBlob(briefingId: string): Promise<Blob | null> {
  if (isNative) {
    try {
      const result = await Filesystem.readFile({
        path: `${CACHE_DIR}/${briefingId}.audio`,
        directory: Directory.Data,
      });
      // Capacitor returns base64 string for binary files
      const binary = atob(result.data as string);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes]);
    } catch {
      return null;
    }
  } else {
    const cache = await caches.open(DB_NAME);
    const response = await cache.match(`/blipp-audio/${briefingId}`);
    return response ? response.blob() : null;
  }
}

async function deleteBlob(briefingId: string): Promise<void> {
  if (isNative) {
    try {
      await Filesystem.deleteFile({
        path: `${CACHE_DIR}/${briefingId}.audio`,
        directory: Directory.Data,
      });
    } catch {
      // File may not exist
    }
  } else {
    const cache = await caches.open(DB_NAME);
    await cache.delete(`/blipp-audio/${briefingId}`);
  }
}

// --- Storage Manager ---

export class StorageManager {
  private db: IDBDatabase | null = null;
  private budgetBytes: number;
  private dbName: string;
  private storeName: string;
  private currentlyPlayingId: string | null = null;
  private getToken: (() => Promise<string | null>) | undefined;

  constructor(config: StorageManagerConfig = {}) {
    this.budgetBytes = config.budgetBytes ?? DEFAULT_BUDGET_BYTES;
    this.dbName = config.dbName ?? DB_NAME;
    this.storeName = config.storeName ?? MANIFEST_STORE;
    this.getToken = config.getToken;
  }

  async init(): Promise<void> {
    this.db = await openManifestDB(this.dbName, this.storeName);
  }

  private ensureDb(): IDBDatabase {
    if (!this.db) throw new Error('StorageManager not initialized. Call init() first.');
    return this.db;
  }

  setCurrentlyPlaying(briefingId: string | null): void {
    this.currentlyPlayingId = briefingId;
  }

  async getEntry(briefingId: string): Promise<CachedBlippEntry | undefined> {
    return idbGet<CachedBlippEntry>(this.ensureDb(), this.storeName, briefingId);
  }

  async getAllEntries(): Promise<CachedBlippEntry[]> {
    return idbGetAll<CachedBlippEntry>(this.ensureDb(), this.storeName);
  }

  async getUsage(): Promise<StorageUsage> {
    const entries = await this.getAllEntries();
    const usedBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
    return {
      usedBytes,
      budgetBytes: this.budgetBytes,
      entryCount: entries.length,
    };
  }

  setBudget(bytes: number): void {
    this.budgetBytes = bytes;
  }

  async has(briefingId: string): Promise<boolean> {
    const entry = await this.getEntry(briefingId);
    return entry !== undefined;
  }

  async store(briefingId: string, blob: Blob): Promise<void> {
    const sizeBytes = blob.size;

    // Evict until we have room
    await this.evictUntilFits(sizeBytes);

    // Write blob to storage
    await writeBlob(briefingId, blob);

    // Write manifest entry
    const entry: CachedBlippEntry = {
      briefingId,
      cachedAt: Date.now(),
      sizeBytes,
      listenedAt: null,
      expiresAt: null,
    };
    await idbPut(this.ensureDb(), this.storeName, entry);
  }

  async retrieve(briefingId: string): Promise<Blob | null> {
    const entry = await this.getEntry(briefingId);
    if (!entry) return null;
    return readBlob(briefingId);
  }

  async markListened(briefingId: string): Promise<void> {
    const entry = await this.getEntry(briefingId);
    if (!entry) return;
    entry.listenedAt = Date.now();
    await idbPut(this.ensureDb(), this.storeName, entry);
  }

  /**
   * Resolve a playable URL for the audio element.
   *
   * Cache hit → returns a local blob:// (web) or file:// (native) URL.
   * Cache miss → fetches /api/briefings/:id/audio-url and returns the signed URL.
   * Stale manifest (readBlob returns null) → removes entry, treats as miss.
   *
   * Note: this method does NOT trigger the background download-to-store on miss.
   * That side-effect is the prefetcher's job — call it explicitly after a miss
   * if you want the next play of this item to be instant.
   */
  async getPlayableUrl(briefingId: string): Promise<string> {
    const entry = await this.getEntry(briefingId);
    if (entry) {
      const blob = await readBlob(briefingId);
      if (blob) {
        return URL.createObjectURL(blob);
      }
      // Manifest is stale — clean up and fall through to network.
      await this.remove(briefingId);
    }

    const token = (await this.getToken?.()) ?? null;
    const res = await fetch(`${getApiBase()}/api/briefings/${briefingId}/audio-url`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      throw new Error(`audio-url fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as { url: string; expiresAt: number };
    return body.url;
  }

  /**
   * Reap cached entries whose briefingId is no longer in the active feed.
   * Never removes the currently-playing entry.
   */
  async pruneNotInFeed(activeBriefingIds: string[]): Promise<void> {
    const active = new Set(activeBriefingIds);
    const entries = await this.getAllEntries();
    for (const entry of entries) {
      if (active.has(entry.briefingId)) continue;
      if (entry.briefingId === this.currentlyPlayingId) continue;
      await this.remove(entry.briefingId);
    }
  }

  async remove(briefingId: string): Promise<void> {
    await deleteBlob(briefingId);
    await idbDelete(this.ensureDb(), this.storeName, briefingId);
  }

  async clearAll(): Promise<void> {
    const entries = await this.getAllEntries();
    await Promise.all(entries.map((e) => deleteBlob(e.briefingId)));
    await idbClear(this.ensureDb(), this.storeName);
  }

  /**
   * Eviction policy:
   * 1. Listened blipps older than 24h (oldest first)
   * 2. Unlistened blipps (oldest first)
   * Never evict the currently-playing blipp.
   */
  private async evictUntilFits(neededBytes: number): Promise<void> {
    const usage = await this.getUsage();
    let available = this.budgetBytes - usage.usedBytes;
    if (available >= neededBytes) return;

    const entries = await this.getAllEntries();
    const now = Date.now();

    // Phase 1: listened > 24h ago, oldest first
    const listenedStale = entries
      .filter(
        (e) =>
          e.listenedAt !== null &&
          now - e.listenedAt > LISTENED_EVICTION_THRESHOLD_MS &&
          e.briefingId !== this.currentlyPlayingId,
      )
      .sort((a, b) => (a.listenedAt! - b.listenedAt!));

    for (const entry of listenedStale) {
      if (available >= neededBytes) break;
      await this.remove(entry.briefingId);
      available += entry.sizeBytes;
    }

    if (available >= neededBytes) return;

    // Phase 2: unlistened, oldest cached first
    const unlistened = entries
      .filter(
        (e) =>
          e.listenedAt === null &&
          e.briefingId !== this.currentlyPlayingId,
      )
      .sort((a, b) => a.cachedAt - b.cachedAt);

    for (const entry of unlistened) {
      if (available >= neededBytes) break;
      await this.remove(entry.briefingId);
      available += entry.sizeBytes;
    }

    // If still not enough, evict remaining listened (recently listened)
    if (available < neededBytes) {
      const listenedRecent = entries
        .filter(
          (e) =>
            e.listenedAt !== null &&
            now - e.listenedAt <= LISTENED_EVICTION_THRESHOLD_MS &&
            e.briefingId !== this.currentlyPlayingId,
        )
        .sort((a, b) => a.listenedAt! - b.listenedAt!);

      for (const entry of listenedRecent) {
        if (available >= neededBytes) break;
        await this.remove(entry.briefingId);
        available += entry.sizeBytes;
      }
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}
