export type HomeLoadTiming = {
  traceId: string;
  startedAt: number;
  marks: Record<string, number>;
  details: Record<string, number>;
};

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function isPreviewRuntime() {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return hostname.endsWith(".vercel.app") && hostname !== "fenzu-system.vercel.app";
}

export function createHomeLoadTiming(): HomeLoadTiming {
  const startedAt = now();
  return { traceId: `home-${crypto.randomUUID()}`, startedAt, marks: { HOME_T0: startedAt }, details: {} };
}

export function markHomeLoadTiming(timing: HomeLoadTiming, mark: string) {
  timing.marks[mark] = now();
}

export function setHomeLoadTiming(timing: HomeLoadTiming, key: string, value: number) {
  timing.details[key] = Math.max(0, Math.round(value));
}

/** Preview-only client observability. It runs after the page is interactive. */
export function emitHomeLoadTiming(timing: HomeLoadTiming, accessToken: string) {
  if (!isPreviewRuntime()) return;
  void fetch("/api/performance-timing/home", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      traceId: timing.traceId,
      coreLoadMs: timing.details.HOME_CORE_LOAD_MS ?? null,
      secondaryLoadMs: timing.details.HOME_SECONDARY_LOAD_MS ?? null,
      totalMs: timing.details.HOME_TOTAL_MS ?? null
    })
  }).catch(() => undefined);
}
