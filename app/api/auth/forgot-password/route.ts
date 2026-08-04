import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { isInternalAuthEmail } from "@/lib/password-security";
import { getSupabaseAdmin, getSupabasePublicServerClient } from "@/lib/supabase-admin";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function rateLimitKey(request: Request, email: string) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(`${ip}|${email}`).digest("hex");
}

function isAllowedHost(host: string) {
  const normalized = host.toLowerCase().split(":")[0];
  return normalized === "fenzu-system.vercel.app"
    || normalized === "localhost"
    || normalized === "127.0.0.1"
    || (normalized.endsWith(".vercel.app") && normalized.startsWith("fenzu-system-"));
}

function recoveryRedirect(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || url.host;
  if (!isAllowedHost(host)) return "https://fenzu-system.vercel.app/reset-password";
  const protocol = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${protocol}://${host}/reset-password`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "请输入有效邮箱地址。", code: "invalid_email" }, { status: 400 });
  }

  const now = Date.now();
  const key = rateLimitKey(request, email);
  const previous = attempts.get(key);
  if (previous && previous.resetAt > now && previous.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试。", code: "rate_limited" }, { status: 429 });
  }
  attempts.set(key, previous && previous.resetAt > now
    ? { count: previous.count + 1, resetAt: previous.resetAt }
    : { count: 1, resetAt: now + WINDOW_MS });

  try {
    const admin = getSupabaseAdmin();
    const { data: identity } = await admin
      .from("account_auth_identities")
      .select("auth_email,is_internal_email")
      .eq("auth_email", email)
      .maybeSingle();
    if (identity && !identity.is_internal_email && !isInternalAuthEmail(identity.auth_email)) {
      const { error } = await getSupabasePublicServerClient().auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirect(request) });
      if (error) console.error("[auth] password recovery request failed", error.message);
    }
  } catch (error) {
    console.error("[auth] password recovery request unavailable", error instanceof Error ? error.message : error);
  }

  return NextResponse.json({ ok: true, message: "如果该邮箱已注册，我们会发送密码重置邮件。" });
}
