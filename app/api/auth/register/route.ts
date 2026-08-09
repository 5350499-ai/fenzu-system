import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse } from "@/lib/server/account-auth";
import { createPublicFreeSingleAccount } from "@/lib/server/account-management";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function rateLimitKey(request: Request, email: string) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(`${ip}|${email}`).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as {
      email?: unknown;
      password?: unknown;
      passwordConfirmation?: unknown;
      displayName?: unknown;
    } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const now = Date.now();
    const key = rateLimitKey(request, email || "invalid");
    const previous = attempts.get(key);
    if (previous && previous.resetAt > now && previous.count >= MAX_ATTEMPTS) {
      throw new AccountApiError("注册请求过于频繁，请稍后再试。", 429, "rate_limited");
    }
    attempts.set(key, previous && previous.resetAt > now
      ? { count: previous.count + 1, resetAt: previous.resetAt }
      : { count: 1, resetAt: now + WINDOW_MS });

    const account = await createPublicFreeSingleAccount({
      email: body?.email,
      password: body?.password,
      passwordConfirmation: body?.passwordConfirmation,
      displayName: body?.displayName
    });
    return NextResponse.json({ ok: true, account: { email: account.email, displayName: account.displayName, accountPlan: "free_single" } }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
