import { getLoginAccessHandoffTelemetry } from "@/lib/login-access-handoff";

export type SaveTimingFlow = "check-in" | "tenant-create" | "renewal" | "payment-save" | "login" | "expense-create" | "expense-edit";

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
const LOGIN_PENDING_KEY = "preview-save-timing-login";

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

export function storePendingLoginTiming(trace: SaveTimingTrace) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(LOGIN_PENDING_KEY, JSON.stringify(trace));
}

export function takePendingLoginTiming() {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(LOGIN_PENDING_KEY);
  window.sessionStorage.removeItem(LOGIN_PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveTimingTrace;
  } catch {
    return null;
  }
}

export function emitLoginTiming(trace: SaveTimingTrace, accessToken: string) {
  if (!trace.previewEnabled && typeof window !== "undefined" && !window.location.hostname.endsWith(".vercel.app")) return;
  const handoff = getLoginAccessHandoffTelemetry(trace.traceId);
  void fetch("/api/performance-timing/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      traceId: trace.traceId,
      loginApiMs: durationBetween(trace, "API_START", "API_END"),
      sessionMs: durationBetween(trace, "API_END", "SESSION_READY"),
      accountMs: durationBetween(trace, "ACCOUNT_ACCESS_START", "ACCOUNT_ACCESS_END"),
      loginAccessInitialMs: durationBetween(trace, "ACCOUNT_ACCESS_START", "ACCOUNT_ACCESS_END"),
      loginHandoffUsed: handoff?.handoffUsed ?? null,
      loginDuplicateAccountRequestCount: handoff?.immediateAccountRequestCount ?? null,
      redirectToHomeMs: durationBetween(trace, "REDIRECT_START", "HOME_LOAD_START"),
      homeLoadMs: durationBetween(trace, "HOME_LOAD_START", "HOME_INTERACTIVE"),
      totalMs: durationBetween(trace, "T0", "HOME_INTERACTIVE")
    })
  }).catch(() => undefined);
}

export function emitExpenseTiming(trace: SaveTimingTrace) {
  if (!trace.previewEnabled && typeof window !== "undefined" && !window.location.hostname.endsWith(".vercel.app")) return;
  void import("@/lib/supabase").then(({ getValidSupabaseSession }) => getValidSupabaseSession()).then((session) => {
    if (!session) return;
    void fetch("/api/performance-timing/expense", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        traceId: trace.traceId,
        flow: trace.flow,
        validationMs: durationBetween(trace, "T0", "VALIDATION_END"),
        apiMs: durationBetween(trace, "API_START", "API_END"),
        dbMs: trace.details.serverDbMs ?? null,
        attachmentMs: trace.details.attachmentMs === "N/A" ? null : durationBetween(trace, "ATTACHMENT_START", "ATTACHMENT_END"),
        localStateMs: durationBetween(trace, "API_END", "LOCAL_STATE_READY"),
        totalMs: durationBetween(trace, "T0", "UI_INTERACTIVE")
      })
    }).catch(() => undefined);
  }).catch(() => undefined);
}
