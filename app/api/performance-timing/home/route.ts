import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount } from "@/lib/server/account-auth";

function isPreviewTiming() {
  return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV !== "production";
}

function validDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 120_000;
}

/** Authenticated, Preview-only observability sink. It never persists business data. */
export async function POST(request: Request) {
  if (!isPreviewTiming()) return new NextResponse(null, { status: 404 });
  try {
    await requireActiveAccount(request);
    const body = await parseJson(request) as { traceId?: unknown; coreLoadMs?: unknown; secondaryLoadMs?: unknown; totalMs?: unknown };
    if (typeof body.traceId !== "string" || !/^home-[0-9a-f-]{36}$/i.test(body.traceId)
      || !validDuration(body.coreLoadMs) || !validDuration(body.secondaryLoadMs) || !validDuration(body.totalMs)) {
      throw new AccountApiError("首页性能测量请求无效。", 400);
    }
    console.info("[home-timing]", JSON.stringify({
      traceId: body.traceId,
      flow: "home-load",
      coreLoadMs: Math.round(body.coreLoadMs),
      secondaryLoadMs: Math.round(body.secondaryLoadMs),
      totalMs: Math.round(body.totalMs)
    }));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
