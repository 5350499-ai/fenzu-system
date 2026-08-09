import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { PENDING_VERIFICATION_COOKIE, verifyVerificationTicket } from "@/lib/server/verification-ticket";

export async function POST() {
  const ticket = verifyVerificationTicket((await cookies()).get(PENDING_VERIFICATION_COOKIE)?.value);
  if (!ticket) {
    return NextResponse.json({ ok: true, verified: false, available: false, message: "请重新打开注册页面后再检查验证状态。" }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(ticket.userId);
  const emailMatches = data.user?.email?.trim().toLowerCase() === ticket.email;
  const verified = !error && emailMatches && Boolean(data.user?.email_confirmed_at);
  return NextResponse.json({
    ok: true,
    verified,
    available: true,
    message: verified ? "邮箱验证成功，请登录。" : "邮箱尚未完成验证，请先点击邮件中的验证链接。"
  }, { headers: { "Cache-Control": "no-store" } });
}
