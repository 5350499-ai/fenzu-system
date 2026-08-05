"use client";

type TraceDetails = Record<string, unknown>;
type TraceController = { emit: (event: string, details?: TraceDetails) => void; restore: () => void };
type TraceWindow = Window & typeof globalThis & { __backupRuntimeTrace?: TraceController };

const TRACE_ENDPOINT = "/api/debug/backup-trace";

export function traceBackupRuntimeEvent(event: string, details: TraceDetails = {}) {
  if (typeof window === "undefined") return;
  (window as TraceWindow).__backupRuntimeTrace?.emit(event, details);
}

export function installBackupRuntimeTrace(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;
  const runtimeWindow = window as TraceWindow;
  if (runtimeWindow.__backupRuntimeTrace) return runtimeWindow.__backupRuntimeTrace.restore;
  const startedAt = performance.now();
  const entries: Array<Record<string, unknown>> = [];
  const originals: Array<() => void> = [];
  const safeDetails = (details: TraceDetails) => Object.fromEntries(Object.entries(details).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value) || value === null));
  const emit = (event: string, details: TraceDetails = {}) => {
    const safe = safeDetails(details);
    const entry = { event, elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10, ...safe };
    entries.push(entry);
    console.debug("[BACKUP_RUNTIME_TRACE]", entry);
    void fetch(TRACE_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry), keepalive: true }).catch(() => undefined);
  };
  const count = (key: string) => { const current = Number((runtimeWindow as Window & { __backupTraceCounts?: Record<string, number> }).__backupTraceCounts?.[key] || 0); const counts = (runtimeWindow as Window & { __backupTraceCounts?: Record<string, number> }).__backupTraceCounts || {}; counts[key] = current + 1; (runtimeWindow as Window & { __backupTraceCounts?: Record<string, number> }).__backupTraceCounts = counts; };

  const originalFile = window.File;
  const originalBlob = window.Blob;
  const originalCreateElement = document.createElement.bind(document);
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  const originalAppendChild = Node.prototype.appendChild;
  const originalRemoveChild = Node.prototype.removeChild;
  const originalElementRemove = Element.prototype.remove;
  const originalWindowOpen = window.open;
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  const originalUrlCreateObjectURL = URL.createObjectURL;
  const originalUrlRevokeObjectURL = URL.revokeObjectURL;
  const originalCanShare = navigator.canShare;
  const originalShare = navigator.share;
  const anchorDownloadDescriptor = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, "download");

  try {
    function TracedFile(parts: BlobPart[], name: string, options?: FilePropertyBag) { count("File"); emit("FILE_CREATED_LOW_LEVEL", { name, type: options?.type || "", partCount: parts.length }); return Reflect.construct(originalFile, [parts, name, options]); }
    TracedFile.prototype = originalFile.prototype; Object.setPrototypeOf(TracedFile, originalFile); runtimeWindow.File = TracedFile as unknown as typeof File; originals.push(() => { runtimeWindow.File = originalFile; });
  } catch (error) { emit("PATCH_FILE_FAILED", { message: String(error) }); }
  try {
    function TracedBlob(parts?: BlobPart[], options?: BlobPropertyBag) { count("Blob"); emit("BLOB_CREATED", { type: options?.type || "", partCount: parts?.length || 0 }); return Reflect.construct(originalBlob, [parts, options]); }
    TracedBlob.prototype = originalBlob.prototype; Object.setPrototypeOf(TracedBlob, originalBlob); runtimeWindow.Blob = TracedBlob as unknown as typeof Blob; originals.push(() => { runtimeWindow.Blob = originalBlob; });
  } catch (error) { emit("PATCH_BLOB_FAILED", { message: String(error) }); }
  try {
    URL.createObjectURL = ((object: Blob) => { count("URL.createObjectURL"); const url = originalUrlCreateObjectURL.call(URL, object); emit("OBJECT_URL_CREATED", { type: object.type, size: object.size }); return url; }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((url: string) => { count("URL.revokeObjectURL"); emit("OBJECT_URL_REVOKED"); return originalUrlRevokeObjectURL.call(URL, url); }) as typeof URL.revokeObjectURL;
    originals.push(() => { URL.createObjectURL = originalUrlCreateObjectURL; URL.revokeObjectURL = originalUrlRevokeObjectURL; });
  } catch (error) { emit("PATCH_URL_FAILED", { message: String(error) }); }
  try {
    document.createElement = ((tagName: string, options?: ElementCreationOptions) => { const element = originalCreateElement(tagName, options); if (tagName.toLowerCase() === "a") { count("document.createElement(a)"); emit("ANCHOR_CREATED"); } return element; }) as typeof document.createElement;
    originals.push(() => { document.createElement = originalCreateElement; });
  } catch (error) { emit("PATCH_CREATE_ELEMENT_FAILED", { message: String(error) }); }
  try {
    HTMLAnchorElement.prototype.click = function (...args: []) { count("HTMLAnchorElement.click"); emit("ANCHOR_CLICK", { download: this.download, hrefKind: this.href.startsWith("blob:") ? "blob" : "other" }); return originalAnchorClick.apply(this, args); };
    originals.push(() => { HTMLAnchorElement.prototype.click = originalAnchorClick; });
  } catch (error) { emit("PATCH_ANCHOR_CLICK_FAILED", { message: String(error) }); }
  try {
    Node.prototype.appendChild = (function <T extends Node>(this: Node, node: T) { if (node instanceof HTMLAnchorElement) { count("appendChild(a)"); emit("ANCHOR_APPENDED"); } return originalAppendChild.call(this, node); }) as typeof Node.prototype.appendChild;
    Node.prototype.removeChild = (function <T extends Node>(this: Node, node: T) { if (node instanceof HTMLAnchorElement) { count("removeChild(a)"); emit("ANCHOR_REMOVED"); } return originalRemoveChild.call(this, node); }) as typeof Node.prototype.removeChild;
    Element.prototype.remove = function (this: Element, ...args: []) { if (this instanceof HTMLAnchorElement) { count("Element.remove(a)"); emit("ANCHOR_REMOVED"); } return originalElementRemove.apply(this, args); };
    originals.push(() => { Node.prototype.appendChild = originalAppendChild; Node.prototype.removeChild = originalRemoveChild; Element.prototype.remove = originalElementRemove; });
  } catch (error) { emit("PATCH_NODE_FAILED", { message: String(error) }); }
  try {
    if (anchorDownloadDescriptor?.get && anchorDownloadDescriptor.set) {
      Object.defineProperty(HTMLAnchorElement.prototype, "download", { configurable: true, enumerable: anchorDownloadDescriptor.enumerable, get: anchorDownloadDescriptor.get, set(value: string) { count("anchor.download"); emit("ANCHOR_DOWNLOAD_SET", { value }); anchorDownloadDescriptor.set?.call(this, value); } });
      originals.push(() => { Object.defineProperty(HTMLAnchorElement.prototype, "download", anchorDownloadDescriptor); });
    }
  } catch (error) { emit("PATCH_DOWNLOAD_FAILED", { message: String(error) }); }
  try {
    window.open = function (...args: Parameters<typeof window.open>) { count("window.open"); emit("WINDOW_OPEN"); return originalWindowOpen.apply(window, args); };
    history.pushState = function (...args: Parameters<typeof history.pushState>) { count("history.pushState"); emit("HISTORY_PUSH_STATE"); return originalPushState.apply(history, args); };
    history.replaceState = function (...args: Parameters<typeof history.replaceState>) { count("history.replaceState"); emit("HISTORY_REPLACE_STATE"); return originalReplaceState.apply(history, args); };
    originals.push(() => { window.open = originalWindowOpen; history.pushState = originalPushState; history.replaceState = originalReplaceState; });
  } catch (error) { emit("PATCH_NAVIGATION_FAILED", { message: String(error) }); }
  try {
    if (typeof originalCanShare === "function") { Object.defineProperty(navigator, "canShare", { configurable: true, value(data: ShareData) { count("navigator.canShare"); const result = originalCanShare.call(navigator, data); emit("CAN_SHARE", { result, fileCount: data.files?.length || 0 }); return result; } }); originals.push(() => { Object.defineProperty(navigator, "canShare", { configurable: true, value: originalCanShare }); }); }
    if (typeof originalShare === "function") { Object.defineProperty(navigator, "share", { configurable: true, value(data: ShareData) { count("navigator.share"); emit("SHARE_START", { fileCount: data.files?.length || 0 }); return originalShare.call(navigator, data).then((result) => { emit("SHARE_RETURN"); return result; }, (error: unknown) => { emit("SHARE_REJECT", { name: error instanceof DOMException ? error.name : "unknown" }); throw error; }); } }); originals.push(() => { Object.defineProperty(navigator, "share", { configurable: true, value: originalShare }); }); }
  } catch (error) { emit("PATCH_SHARE_FAILED", { message: String(error) }); }
  const lifecycleEvents = ["beforeunload", "visibilitychange", "pagehide", "pageshow"] as const;
  const listeners = lifecycleEvents.map((eventName) => { const listener = () => emit(`LIFECYCLE_${eventName.toUpperCase()}`, { visibility: document.visibilityState }); window.addEventListener(eventName, listener, true); return [eventName, listener] as const; });
  originals.push(() => { listeners.forEach(([eventName, listener]) => window.removeEventListener(eventName, listener, true)); });
  const restore = () => { [...originals].reverse().forEach((restoreOriginal) => { try { restoreOriginal(); } catch { /* temporary tracing cleanup */ } }); emit("TRACE_RESTORED", { entryCount: entries.length }); delete runtimeWindow.__backupRuntimeTrace; };
  runtimeWindow.__backupRuntimeTrace = { emit, restore };
  emit("TRACE_INSTALLED");
  return restore;
}
