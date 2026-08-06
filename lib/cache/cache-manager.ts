export const GLOBAL_CACHE_VERSION = "global-cache-v3";
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry<T = unknown> = {
  version: string;
  scope: string;
  key: string;
  value: T;
  updatedAt: number;
  expiresAt: number;
};

type CacheOptions<T> = {
  scope: string;
  loader: (context?: { revalidate?: boolean }) => Promise<T>;
  ttlMs?: number;
};

type CacheEvent = {
  type: "set" | "invalidate" | "clear";
  scope: string;
  keys?: string[];
};

const DB_NAME = "fenzu-global-cache";
const STORE_NAME = "entries";
const CHANNEL_NAME = "fenzu-global-cache-v3";

function storageKey(scope: string, key: string) {
  return `${GLOBAL_CACHE_VERSION}:${scope}:${key}`;
}

function isBrowser() {
  return typeof window !== "undefined";
}

class CacheManager {
  private memory = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<unknown>>();
  private listeners = new Map<string, Set<() => void>>();
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private channel: BroadcastChannel | null = null;
  private disabled = false;
  private stats = { memoryHits: 0, indexedDbHits: 0, serverRequests: 0, lastUpdatedAt: 0 };

  constructor() {
    if (!isBrowser()) return;
    this.disabled = window.localStorage.getItem("fenzu-cache-force-disabled") === "1";
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.addEventListener("message", (event: MessageEvent<CacheEvent>) => this.handleExternalEvent(event.data));
    }
    window.addEventListener("storage", (event) => {
      if (event.key === "fenzu-cache-force-disabled") {
        this.disabled = event.newValue === "1";
        if (this.disabled) this.clearMemory();
      }
    });
  }

  isDisabled() {
    return this.disabled;
  }

  setDisabled(disabled: boolean) {
    this.disabled = disabled;
    if (isBrowser()) window.localStorage.setItem("fenzu-cache-force-disabled", disabled ? "1" : "0");
    if (disabled) this.clearMemory();
  }

  getStats() {
    return { ...this.stats, memoryEntries: this.memory.size, disabled: this.disabled };
  }

  subscribe(scope: string, key: string, callback: () => void) {
    const listenerKey = storageKey(scope, key);
    const listeners = this.listeners.get(listenerKey) || new Set<() => void>();
    listeners.add(callback);
    this.listeners.set(listenerKey, listeners);
    return () => {
      listeners.delete(callback);
      if (!listeners.size) this.listeners.delete(listenerKey);
    };
  }

  async get<T>(key: string, options: CacheOptions<T>): Promise<T> {
    if (this.disabled || !isBrowser()) {
      this.stats.serverRequests += 1;
      return options.loader({ revalidate: false });
    }

    const cacheKey = storageKey(options.scope, key);
    const memoryEntry = this.memory.get(cacheKey) as CacheEntry<T> | undefined;
    if (memoryEntry) {
      this.stats.memoryHits += 1;
      this.revalidate(key, options).catch(() => undefined);
      return memoryEntry.value;
    }

    const persisted = await this.readIndexedDb<T>(cacheKey);
    if (persisted) {
      this.memory.set(cacheKey, persisted);
      this.stats.indexedDbHits += 1;
      this.revalidate(key, options).catch(() => undefined);
      return persisted.value;
    }

    const inflightKey = cacheKey;
    const existing = this.inflight.get(inflightKey) as Promise<T> | undefined;
    if (existing) return existing;
    const request = (async () => {
      this.stats.serverRequests += 1;
      const value = await options.loader({ revalidate: false });
      await this.set(key, value, options.scope, options.ttlMs);
      return value;
    })();
    this.inflight.set(inflightKey, request);
    try {
      return await request;
    } finally {
      this.inflight.delete(inflightKey);
    }
  }

  async set<T>(key: string, value: T, scope: string, ttlMs = DEFAULT_CACHE_TTL_MS) {
    if (this.disabled || !isBrowser()) return;
    const now = Date.now();
    const entry: CacheEntry<T> = { version: GLOBAL_CACHE_VERSION, scope, key, value, updatedAt: now, expiresAt: now + ttlMs };
    const cacheKey = storageKey(scope, key);
    this.memory.set(cacheKey, entry);
    this.stats.lastUpdatedAt = now;
    await this.writeIndexedDb(cacheKey, entry);
    this.publish({ type: "set", scope, keys: [key] });
    this.notify(scope, key);
  }

  async invalidate(keys: string[], scope: string) {
    if (!isBrowser()) return;
    for (const key of keys) {
      const cacheKey = storageKey(scope, key);
      this.memory.delete(cacheKey);
      await this.deleteIndexedDb(cacheKey);
      this.notify(scope, key);
    }
    this.publish({ type: "invalidate", scope, keys });
  }

  async clearScope(scope: string) {
    if (!isBrowser()) return;
    for (const cacheKey of [...this.memory.keys()]) {
      if (cacheKey.includes(`:${scope}:`)) this.memory.delete(cacheKey);
    }
    await this.deleteIndexedDbByScope(scope);
    this.publish({ type: "clear", scope });
  }

  async clearAll() {
    if (!isBrowser()) return;
    this.clearMemory();
    await this.deleteAllIndexedDb();
    this.publish({ type: "clear", scope: "*" });
  }

  private clearMemory() {
    this.memory.clear();
    this.inflight.clear();
  }

  private async revalidate<T>(key: string, options: CacheOptions<T>) {
    if (this.disabled || this.inflight.has(storageKey(options.scope, key))) return;
    const cacheKey = storageKey(options.scope, key);
    const request = (async () => {
      this.stats.serverRequests += 1;
      const value = await options.loader({ revalidate: true });
      await this.set(key, value, options.scope, options.ttlMs);
    })();
    this.inflight.set(cacheKey, request);
    try {
      await request;
    } finally {
      this.inflight.delete(cacheKey);
    }
  }

  peekMemory<T>(key: string, scope: string) {
    return (this.memory.get(storageKey(scope, key)) as CacheEntry<T> | undefined)?.value || null;
  }

  private notify(scope: string, key: string) {
    this.listeners.get(storageKey(scope, key))?.forEach((callback) => callback());
  }

  private publish(event: CacheEvent) {
    try { this.channel?.postMessage(event); } catch { /* cross-tab notification is best effort */ }
  }

  private handleExternalEvent(event?: CacheEvent) {
    if (!event || !isBrowser()) return;
    if (event.type === "clear" && event.scope === "*") this.clearMemory();
    else if (event.type === "clear") this.clearMemory();
    else if (event.keys) event.keys.forEach((key) => this.memory.delete(storageKey(event.scope, key)));
    event.keys?.forEach((key) => this.notify(event.scope, key));
  }

  private openDb() {
    if (!isBrowser() || !window.indexedDB) return Promise.resolve(null);
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    return this.dbPromise;
  }

  private async readIndexedDb<T>(key: string) {
    const db = await this.openDb();
    if (!db) return null;
    return new Promise<CacheEntry<T> | null>((resolve) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        const value = request.result as CacheEntry<T> | undefined;
        resolve(value?.version === GLOBAL_CACHE_VERSION ? value : null);
      };
      request.onerror = () => resolve(null);
    });
  }

  private async writeIndexedDb(key: string, entry: CacheEntry) {
    const db = await this.openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(entry, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }

  private async deleteIndexedDb(key: string) {
    const db = await this.openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }

  private async deleteIndexedDbByScope(scope: string) {
    const db = await this.openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).openCursor();
      request.onsuccess = () => {
        const cursor = request.result as IDBCursorWithValue | null;
        if (!cursor) return resolve();
        if (String(cursor.key).includes(`:${scope}:`)) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => resolve();
    });
  }

  private async deleteAllIndexedDb() {
    const db = await this.openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }
}

export const cacheManager = new CacheManager();
