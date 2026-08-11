import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error test runner imports the TypeScript module directly.
import { CacheManager } from "../lib/cache/cache-manager.ts";

type FakeRequest = { result?: unknown; error?: Error; onsuccess?: () => void; onerror?: () => void };

class FakeDatabase {
  readonly objectStoreNames = { contains: () => true };
  onversionchange: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  transactionCalls = 0;
  putCalls = 0;

  private readonly closing: boolean;

  constructor(closing = false) {
    this.closing = closing;
  }

  createObjectStore() { return {}; }

  close() {
    this.closed = true;
    this.onclose?.();
  }

  transaction() {
    this.transactionCalls += 1;
    if (this.closed || this.closing) throw new DOMException("The database connection is closing.", "InvalidStateError");
    const transaction: { oncomplete: (() => void) | null; onerror: (() => void) | null; onabort: (() => void) | null; error: Error | null; objectStore: () => unknown } = {
      oncomplete: null, onerror: null, onabort: null, error: null, objectStore: () => store
    };
    const complete = () => queueMicrotask(() => transaction.oncomplete?.());
    const store = {
      get: () => {
        const request: FakeRequest = {};
        queueMicrotask(() => { request.onsuccess?.(); complete(); });
        return request;
      },
      put: () => { this.putCalls += 1; complete(); },
      delete: () => complete(),
      clear: () => complete(),
      openCursor: () => {
        const request: FakeRequest = {};
        queueMicrotask(() => { request.onsuccess?.(); complete(); });
        return request;
      }
    };
    return transaction;
  }
}

function installIndexedDb(databases: FakeDatabase[], failFirstOpen = false) {
  let opens = 0;
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousBroadcastChannel = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  const storage = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    indexedDB: {
      open: () => {
        opens += 1;
        const request: FakeRequest = {};
        queueMicrotask(() => {
          if (failFirstOpen && opens === 1) return request.onerror?.();
          request.result = databases[Math.min(opens - 1, databases.length - 1)] as unknown;
          request.onsuccess?.();
        });
        return request;
      }
    },
    localStorage: { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => { storage.set(key, value); } },
    addEventListener: () => undefined
  };
  // Node exposes BroadcastChannel globally; disable it only in this fake browser
  // fixture so the test process has no open message port.
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = undefined;
  return {
    manager: new CacheManager(),
    opens: () => opens,
    restore: () => {
      (globalThis as { window?: unknown }).window = previousWindow;
      (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = previousBroadcastChannel;
    }
  };
}

test("a closing cached connection is invalidated, reopened once and never reaches the loader", async () => {
  const closing = new FakeDatabase(true);
  const replacement = new FakeDatabase();
  const fixture = installIndexedDb([closing, replacement]);
  try {
    assert.equal(await fixture.manager.get("dashboard", { scope: "account", loader: async () => "server" }), "server");
    assert.equal(fixture.opens(), 2);
    assert.equal(closing.transactionCalls, 1);
    assert.ok(replacement.transactionCalls >= 2);
    assert.equal(replacement.putCalls, 1);
  } finally { fixture.restore(); }
});

test("versionchange closes and invalidates the exact connection before the next operation", async () => {
  const first = new FakeDatabase();
  const fixture = installIndexedDb([first, new FakeDatabase()]);
  try {
    await fixture.manager.get("first", { scope: "account", loader: async () => "one" });
    first.onversionchange?.();
    await fixture.manager.get("second", { scope: "account", loader: async () => "two" });
    assert.equal(first.closed, true);
    assert.equal(fixture.opens(), 2);
  } finally { fixture.restore(); }
});

test("concurrent readers share one opening connection", async () => {
  const fixture = installIndexedDb([new FakeDatabase()]);
  try {
    await Promise.all([fixture.manager.get("one", { scope: "account", loader: async () => "one" }), fixture.manager.get("two", { scope: "account", loader: async () => "two" })]);
    assert.equal(fixture.opens(), 1);
  } finally { fixture.restore(); }
});

test("a failed open is not retained and a later request can open a fresh connection", async () => {
  const fixture = installIndexedDb([new FakeDatabase()], true);
  try {
    await fixture.manager.get("one", { scope: "account", loader: async () => "one" });
    await fixture.manager.get("two", { scope: "account", loader: async () => "two" });
    assert.equal(fixture.opens(), 2);
  } finally { fixture.restore(); }
});

test("two consecutive closing connections stop after the one allowed self-heal retry", async () => {
  const fixture = installIndexedDb([new FakeDatabase(true), new FakeDatabase(true)]);
  try {
    const read = await (fixture.manager as unknown as { readIndexedDb: (key: string) => Promise<unknown> }).readIndexedDb("entry");
    assert.equal(read, null);
    assert.equal(fixture.opens(), 2);
  } finally { fixture.restore(); }
});
