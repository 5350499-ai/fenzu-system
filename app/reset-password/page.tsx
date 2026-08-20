"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { clearAccountAccessSnapshot } from "@/components/account-access";
import { passwordValidationMessage } from "@/lib/password-security";
import { AuthBrand } from "@/components/auth-brand";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function prepare() {
      if (!supabase) { setInvalid(true); return; }
      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (!mounted || (event !== "PASSWORD_RECOVERY" && event !== "SIGNED_IN")) return;
        setReady(Boolean(session));
        setInvalid(!session);
      });
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) { if (mounted) setInvalid(true); authListener.subscription.unsubscribe(); return; }
        window.history.replaceState({}, document.title, "/reset-password");
      }
      // supabase-js consumes hash recovery tokens when detectSessionInUrl is
      // enabled. Give that event a short window before treating the link as
      // invalid, without ever rendering or persisting the token.
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setReady(Boolean(data.session));
        setInvalid(!data.session);
      }
      authListener.subscription.unsubscribe();
    }
    void prepare();
    return () => { mounted = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const validation = passwordValidationMessage(password, confirmation);
    if (validation) { setError(validation); return; }
    if (!supabase) { setError("登录服务暂不可用。"); return; }
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError("重置失败，链接可能已失效，请重新发送重置邮件。"); return; }
      const { data } = await supabase.auth.getSession();
      if (data.session) await fetch("/api/auth/revoke-after-recovery", { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` } }).catch(() => undefined);
      await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
      clearAccountAccessSnapshot();
      setMessage("密码已重置，请重新登录。");
      window.setTimeout(() => { window.location.href = "/login"; }, 700);
    } catch { setError("重置失败，请重新发送重置邮件。"); }
    finally { setSaving(false); }
  }

  if (invalid) return <main className="login-page"><section className="card login-card password-security-page"><AuthBrand subtitle="密码安全" /><h1 className="panel-title">链接已失效</h1><p className="muted">该密码重置链接无效或已过期，请重新发送重置邮件。</p><Link className="btn primary" href="/forgot-password">重新发送重置邮件</Link><Link className="btn" href="/login">返回登录</Link></section></main>;
  if (!ready) return <main className="login-page"><section className="card login-card password-security-page"><AuthBrand subtitle="密码安全" /><p className="muted">正在验证重置链接…</p></section></main>;
  return <main className="login-page"><section className="card login-card password-security-page"><AuthBrand subtitle="密码安全" /><h1 className="panel-title">设置新密码</h1><p className="muted">密码至少8位，并同时包含字母和数字。</p><form className="grid" onSubmit={submit}><div className="field"><label htmlFor="reset-password">新密码</label><input id="reset-password" name="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div><div className="field"><label htmlFor="reset-confirmation">确认新密码</label><input id="reset-confirmation" name="new-password-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div><button className="btn primary" type="submit" disabled={saving} aria-busy={saving}>{saving ? "保存中…" : "保存新密码"}</button>{message ? <p className="success-text">{message}</p> : null}{error ? <p className="danger-text">{error}</p> : null}</form></section></main>;
}
