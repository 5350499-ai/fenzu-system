import { NextResponse } from "next/server";

export type ServerTimingContext = {
  traceId: string;
  flow: string;
  startedAt: number;
  marks: Record<string, number>;
};

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function startServerTiming(request: Request, fallbackFlow: string): ServerTimingContext {
  const startedAt = now();
  return {
    traceId: request.headers.get("x-save-trace-id") || "missing-trace-id",
    flow: request.headers.get("x-save-flow") || fallbackFlow,
    startedAt,
    marks: { T3: startedAt }
  };
}

export function markServerTiming(context: ServerTimingContext, mark: string) {
  context.marks[mark] = now();
}

function duration(context: ServerTimingContext, start: string, end: string) {
  const startAt = context.marks[start];
  const endAt = context.marks[end];
  return startAt == null || endAt == null ? null : Math.max(0, endAt - startAt);
}

function isPreviewTiming() {
  return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV !== "production";
}

export function finishServerTiming(response: NextResponse, context: ServerTimingContext) {
  const finishedAt = now();
  context.marks.T5 = context.marks.T5 || finishedAt;
  const serverTotalMs = Math.round(finishedAt - context.startedAt);
  const entries = [
    ["auth", duration(context, "authStart", "authEnd")],
    ["validation", duration(context, "authEnd", "rpcStart")],
    ["rpc", duration(context, "rpcStart", "rpcEnd")],
    ["side-effect", duration(context, "sideEffectStart", "sideEffectEnd")],
    ["total", serverTotalMs]
  ].filter((entry): entry is [string, number] => typeof entry[1] === "number");
  if (isPreviewTiming() && context.traceId !== "missing-trace-id") {
    response.headers.set("x-save-timing-enabled", "1");
    response.headers.set("server-timing", entries.map(([name, value]) => `${name};dur=${Math.round(value)}`).join(", "));
    console.info("[save-timing]", JSON.stringify({ traceId: context.traceId, flow: context.flow, serverTotalMs, timings: Object.fromEntries(entries) }));
  }
  return response;
}
