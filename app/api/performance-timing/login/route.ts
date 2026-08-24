import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount } from "@/lib/server/account-auth";

function isPreviewTiming() {
  return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV !== "production";
}

function validDuration(value: unknown) {
  return value == null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 120000);
}

function validAccountRequestCount(value: unknown) {
  return value == null || value === 1 || value === 2;
}

export async function POST(request: Request) {
  if (!isPreviewTiming()) return new NextResponse(null, { status: 404 });
  try {
    await requireActiveAccount(request);
    const body = await parseJson(request) as Record<string, unknown>;
    if (typeof body.traceId !== "string" || !/^login-[0-9a-f-]{36}$/i.test(body.traceId)
      || !["loginApiMs", "sessionMs", "accountMs", "loginAccessInitialMs", "redirectToHomeMs", "homeLoadMs", "totalMs"].every((key) => validDuration(body[key]))
      || !(body.loginHandoffUsed == null || typeof body.loginHandoffUsed === "boolean")
      || !validAccountRequestCount(body.loginDuplicateAccountRequestCount)) {
      throw new AccountApiError("登录性能测量请求无效。", 400);
    }
    console.info("[login-timing]", JSON.stringify({
      traceId: body.traceId,
      flow: "login-to-home",
      loginApiMs: body.loginApiMs ?? null,
      sessionMs: body.sessionMs ?? null,
      accountMs: body.accountMs ?? null,
      loginAccessInitialMs: body.loginAccessInitialMs ?? null,
      loginHandoffUsed: body.loginHandoffUsed ?? null,
      loginDuplicateAccountRequestCount: body.loginDuplicateAccountRequestCount ?? null,
      redirectToHomeMs: body.redirectToHomeMs ?? null,
      homeLoadMs: body.homeLoadMs ?? null,
      totalMs: body.totalMs ?? null
    }));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
