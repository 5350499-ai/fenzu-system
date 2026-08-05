import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error test runner imports the TypeScript module directly.
import { downloadFile } from "../lib/download-adapter.ts";

function installBrowserMocks(options: { share?: (data: unknown) => Promise<void>; canShare?: (data: unknown) => boolean }) {
  const root = globalThis as any;
  const originals = { navigator: root.navigator, window: root.window, document: root.document, createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
  let clicks = 0;
  Object.defineProperty(root, "navigator", { configurable: true, value: {
    maxTouchPoints: 1,
    canShare: options.canShare,
    share: options.share
  } });
  Object.defineProperty(root, "window", { configurable: true, value: {
    matchMedia: () => ({ matches: true }),
    setTimeout,
  } });
  Object.defineProperty(root, "document", { configurable: true, value: {
    createElement: () => ({ click: () => { clicks += 1; }, style: {}, remove: () => {}, rel: "", download: "", href: "" }),
    body: { appendChild: () => {} }
  } });
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
  return {
    clicks: () => clicks,
    restore: () => {
      Object.defineProperty(root, "navigator", { configurable: true, value: originals.navigator });
      Object.defineProperty(root, "window", { configurable: true, value: originals.window });
      Object.defineProperty(root, "document", { configurable: true, value: originals.document });
      URL.createObjectURL = originals.createObjectURL;
      URL.revokeObjectURL = originals.revokeObjectURL;
    }
  };
}

test("uses Web Share when the file is shareable", async () => {
  let shared = false;
  const mocks = installBrowserMocks({ canShare: () => true, share: async () => { shared = true; } });
  try {
    const result = await downloadFile(new File(["{}"], "backup.json", { type: "application/json" }));
    assert.equal(result.method, "share");
    assert.equal(result.shareAttempted, true);
    assert.equal(shared, true);
    assert.equal(mocks.clicks(), 0);
  } finally {
    mocks.restore();
  }
});

test("does not create a second download when a single-shot Web Share is cancelled", async () => {
  const mocks = installBrowserMocks({ canShare: () => true, share: async () => { throw new DOMException("cancelled", "AbortError"); } });
  try {
    const result = await downloadFile(new File(["{}"], "backup.json", { type: "application/json" }), { fallbackOnShareError: false });
    assert.equal(result.method, "share");
    assert.equal(result.shareCancelled, true);
    assert.equal(result.fallbackReason, "cancelled");
    assert.equal(mocks.clicks(), 0);
  } finally {
    mocks.restore();
  }
});

test("keeps the default Blob fallback for non-backup exports", async () => {
  const mocks = installBrowserMocks({ canShare: () => true, share: async () => { throw new Error("share failed"); } });
  try {
    const result = await downloadFile(new File(["{}"], "report.csv", { type: "text/csv" }));
    assert.equal(result.method, "download");
    assert.equal(result.fallbackReason, "error");
    assert.equal(mocks.clicks(), 1);
  } finally {
    mocks.restore();
  }
});

test("falls back to Blob download when the browser cannot share the file", async () => {
  const mocks = installBrowserMocks({ canShare: () => false, share: async () => {} });
  try {
    const result = await downloadFile(new File(["{}"], "backup.json", { type: "application/json" }));
    assert.equal(result.method, "download");
    assert.equal(result.shareAttempted, false);
    assert.equal(result.fallbackReason, "not-shareable");
    assert.equal(mocks.clicks(), 1);
  } finally {
    mocks.restore();
  }
});
