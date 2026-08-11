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

/**
 * Browser-only cache persistence. IndexedDB is an optional cache layer: a
 * transient browser connection failure must never prevent the server-backed
 * business data from loading or saving.
 */
export class CacheManager {
  private memory = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<unknown>>();
  private listeners = new Map<string, Set<() => void>>();
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private db: IDBDatabase | null = null;
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

  private invalidateDb(db?: IDBDatabase | null) {
    if (!db) {
      this.db = null;
      this.dbPromise = null;
      return;
    }
    if (this.db === db) {
      this.db = null;
      this.dbPromise = null;
    }
  }

  private isClosingConnectionError(error: unknown) {
    const name = error instanceof DOMException ? error.name : "";
    const message = error instanceof Error ? error.message : String(error || "");
    return name === "InvalidStateError" || /database connection is closing|connection is closing|database is closed/i.test(message);
  }

  private openDb() {
    if (!isBrowser() || !window.indexedDB) return Promise.resolve(null);
    if (this.dbPromise) return this.dbPromise;
    const pending = new Promise<IDBDatabase | null>((resolve) => {
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => {
        const db = request.result;
        // A previous connection may have been invalidated while this request
        // was still opening. Do not resurrect that stale result.
        if (this.dbPromise !== pending) {
          try { db.close(); } catch { /* no-op */ }
          resolve(null);
          return;
        }
        const invalidate = () => this.invalidateDb(db);
        // This manager is the single connection owner. A version change makes
        // the cached connection invalid before it is closed, so no later
        // transaction can receive the closing object.
        db.onversionchange = () => {
          invalidate();
          try { db.close(); } catch { /* closing an already closed DB is harmless */ }
        };
        db.onclose = invalidate;
        this.db = db;
        resolve(db);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    this.dbPromise = pending;
    // An unsuccessful open must not poison the singleton promise forever.
    void pending.then((db) => {
      if (!db && this.dbPromise === pending) this.dbPromise = null;
    });
    return this.dbPromise;
  }

  private async runIndexedDb<T>(fallback: T, operation: (db: IDBDatabase) => Promise<T>) {
    // A Safari version-change/restore race can occur after openDb resolves but
    // before transaction starts. Invalidate that exact connection and retry
    // once. Every operation here is cache-only and idempotent; no business
    // write is ever replayed through this path.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const db = await this.openDb();
      if (!db) return fallback;
      try {
        return await operation(db);
      } catch (error) {
        if (!this.isClosingConnectionError(error) || attempt === 1) return fallback;
        this.invalidateDb(db);
      }
    }
    return fallback;
  }

  private transaction<T>(db: IDBDatabase, mode: IDBTransactionMode, action: (store: IDBObjectStore, fail: (error: unknown) => void) => void, result: () => T) {
    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      const fail = (error: unknown) => reject(error instanceof Error ? error : new Error(String(error || "IndexedDB transaction failed")));
      try {
        transaction = db.transaction(STORE_NAME, mode);
        action(transaction.objectStore(STORE_NAME), fail);
      } catch (error) {
        fail(error);
        return;
      }
      transaction.oncomplete = () => resolve(result());
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
  }

  private async readIndexedDb<T>(key: string) {
    let value: CacheEntry<T> | undefined;
    return this.runIndexedDb<CacheEntry<T> | null>(null, async (db) => {
      await this.transaction(db, "readonly", (store, fail) => {
        const request = store.get(key);
        request.onsuccess = () => { value = request.result as CacheEntry<T> | undefined; };
        request.onerror = () => { fail(request.error || new Error("IndexedDB read failed")); };
      }, () => undefined);
      return value?.version === GLOBAL_CACHE_VERSION ? value : null;
    });
  }

  private async writeIndexedDb(key: string, entry: CacheEntry) {
    await this.runIndexedDb(undefined, (db) => this.transaction(db, "readwrite", (store) => { store.put(entry, key); }, () => undefined));
  }

  private async deleteIndexedDb(key: string) {
    await this.runIndexedDb(undefined, (db) => this.transaction(db, "readwrite", (store) => { store.delete(key); }, () => undefined));
  }

  private async deleteIndexedDbByScope(scope: string) {
    await this.runIndexedDb(undefined, (db) => this.transaction(db, "readwrite", (store, fail) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result as IDBCursorWithValue | null;
        if (!cursor) return;
        if (String(cursor.key).includes(`:${scope}:`)) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => { fail(request.error || new Error("IndexedDB cursor read failed")); };
    }, () => undefined));
  }

  private async deleteAllIndexedDb() {
    await this.runIndexedDb(undefined, (db) => this.transaction(db, "readwrite", (store) => { store.clear(); }, () => undefined));
  }
}

export const cacheManager = new CacheManager();
