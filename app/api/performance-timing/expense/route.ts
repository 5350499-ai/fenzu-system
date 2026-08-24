import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount } from "@/lib/server/account-auth";

function isPreviewTiming() {
  return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV !== "production";
}

function validDuration(value: unknown) {
  return value == null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 120000);
}

export async function POST(request: Request) {
  if (!isPreviewTiming()) return new NextResponse(null, { status: 404 });
  try {
    await requireActiveAccount(request);
    const body = await parseJson(request) as Record<string, unknown>;
    if (typeof body.traceId !== "string" || !/^expense-(?:create|edit)-[0-9a-f-]{36}$/i.test(body.traceId)
      || (body.flow !== "expense-create" && body.flow !== "expense-edit")
      || !["validationMs", "apiMs", "dbMs", "attachmentMs", "localStateMs", "totalMs"].every((key) => validDuration(body[key]))) {
      throw new AccountApiError("支出性能测量请求无效。", 400);
    }
    console.info("[expense-timing]", JSON.stringify({
      traceId: body.traceId,
      flow: body.flow,
      validationMs: body.validationMs ?? null,
      apiMs: body.apiMs ?? null,
      dbMs: body.dbMs ?? null,
      attachmentMs: body.attachmentMs ?? null,
      localStateMs: body.localStateMs ?? null,
      totalMs: body.totalMs ?? null
    }));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
