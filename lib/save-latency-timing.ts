export type SaveTimingFlow = "check-in" | "tenant-create" | "renewal" | "payment-save";

export type SaveTimingTrace = {
  traceId: string;
  flow: SaveTimingFlow;
  startedAt: number;
  marks: Record<string, number>;
  details: Record<string, number | string | null>;
  previewEnabled?: boolean;
};

export function timingNow() {
  return typeof performance !== "undefined" && typeof performance.timeOrigin === "number"
    ? performance.timeOrigin + performance.now()
    : Date.now();
}

export function createSaveTiming(flow: SaveTimingFlow): SaveTimingTrace {
  const startedAt = timingNow();
  return {
    traceId: `${flow}-${crypto.randomUUID()}`,
    flow,
    startedAt,
    marks: { T0: startedAt },
    details: {}
  };
}

export function markSaveTiming(trace: SaveTimingTrace, mark: string) {
  trace.marks[mark] = timingNow();
  return trace.marks[mark];
}

export function setSaveTimingDetail(trace: SaveTimingTrace, key: string, value: number | string | null) {
  trace.details[key] = value;
}

export function durationBetween(trace: SaveTimingTrace, start: string, end: string) {
  const startAt = trace.marks[start];
  const endAt = trace.marks[end];
  return startAt == null || endAt == null ? null : Math.round(endAt - startAt);
}

export function saveTimingRequestHeaders(trace: SaveTimingTrace) {
  return {
    "x-save-trace-id": trace.traceId,
    "x-save-flow": trace.flow
  };
}

export function readServerTiming(response: Response) {
  return response.headers.get("server-timing") || "N/A";
}

export function serverTimingDuration(response: Response, name: string) {
  const match = readServerTiming(response).match(new RegExp(`(?:^|,\\s*)${name};dur=([0-9.]+)`));
  return match ? Math.round(Number(match[1])) : null;
}

export function enablePreviewTimingFromResponse(trace: SaveTimingTrace, response: Response) {
  trace.previewEnabled = response.headers.get("x-save-timing-enabled") === "1";
  setSaveTimingDetail(trace, "serverTiming", readServerTiming(response));
}

export function serializeSaveTiming(trace: SaveTimingTrace) {
  return {
    traceId: trace.traceId,
    flow: trace.flow,
    totalMs: trace.marks.T10 == null ? null : Math.round(trace.marks.T10 - trace.startedAt),
    clientValidationMs: durationBetween(trace, "T0", "T1"),
    apiRoundTripMs: durationBetween(trace, "T2", "T6"),
    serverTotalMs: trace.details.serverTotalMs ?? "N/A",
    rpcMs: trace.details.rpcMs ?? "N/A",
    postSaveRefreshMs: durationBetween(trace, "T8", "T9"),
    navigationMs: trace.details.navigationMs ?? "N/A",
    uiReadyMs: durationBetween(trace, "T9", "T10"),
    marks: trace.marks,
    details: trace.details
  };
}

export function emitSaveTiming(trace: SaveTimingTrace) {
  if (!trace.previewEnabled && typeof window !== "undefined" && window.location.hostname !== "localhost") return;
  console.info("[save-timing]", serializeSaveTiming(trace));
}

const CHECK_IN_PENDING_KEY = "preview-save-timing-check-in";

export function storePendingCheckInTiming(trace: SaveTimingTrace) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CHECK_IN_PENDING_KEY, JSON.stringify(trace));
}

export function takePendingCheckInTiming() {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(CHECK_IN_PENDING_KEY);
  window.sessionStorage.removeItem(CHECK_IN_PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveTimingTrace;
  } catch {
    return null;
  }
}
