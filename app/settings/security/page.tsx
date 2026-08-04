"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { clearAccountAccessSnapshot, useAccountAccess } from "@/components/account-access";
import { getValidSupabaseSession, supabase } from "@/lib/supabase";

export default function AccountSecurityPage() {
  const access = useAccountAccess();
  const [email, setEmail] = useState("");
  const [verified, setVerified] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getValidSupabaseSession().then((session) => {
      setEmail(session?.user.email || "");
      setVerified(Boolean(session?.user.email_confirmed_at));
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) { setNotice("密码至少8位，并同时包含字母和数字。"); return; }
    if (newPassword !== confirmation) { setNotice("两次输入的密码不一致。"); return; }
    const session = await getValidSupabaseSession();
    if (!session) { setNotice("登录已失效，请重新登录。"); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword, passwordConfirmation: confirmation }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(payload.error || "密码修改失败，请稍后重试。"); return; }
      setNotice("密码修改成功，请重新登录。");
      clearAccountAccessSnapshot();
      await supabase?.auth.signOut({ scope: "local" });
      window.setTimeout(() => { window.location.href = "/login"; }, 700);
    } catch { setNotice("密码修改失败，请稍后重试。"); }
    finally { setSaving(false); }
  }

  const internalEmail = email.toLowerCase().endsWith("@accounts.fenzu.invalid");
  return <AppLayout title="账号安全" description="管理当前账号的邮箱和密码。"><section className="card panel password-security-panel"><div className="panel-header"><div><h2 className="panel-title">账号安全</h2><p className="muted">只允许修改当前登录账号，不显示或读取任何密码。</p></div><Link className="btn compact" href="/settings">返回设置</Link></div><div className="account-security-summary"><span>当前账号<strong>{access.profileDisplayName || access.profileUsername || "-"}</strong></span><span>邮箱<strong>{internalEmail ? "未绑定可接收邮件邮箱" : email || "未读取到邮箱"}</strong></span><span>邮箱状态<strong>{internalEmail ? "请联系管理员" : verified ? "已验证" : "未验证"}</strong></span></div><form className="form-grid" onSubmit={submit}><div className="field"><label htmlFor="security-current-password">当前密码</label><input id="security-current-password" name="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div><div className="field"><label htmlFor="security-new-password">新密码</label><input id="security-new-password" name="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div><div className="field"><label htmlFor="security-password-confirmation">确认新密码</label><input id="security-password-confirmation" name="new-password-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>{notice ? <p className={notice.includes("成功") ? "success-text" : "danger-text"}>{notice}</p> : null}<div className="settings-actions"><button className="btn primary" type="submit" disabled={saving} aria-busy={saving}>{saving ? "保存中…" : "保存修改"}</button><button className="btn" type="button" onClick={() => { setCurrentPassword(""); setNewPassword(""); setConfirmation(""); }}>清空</button></div></form></section></AppLayout>;
}
