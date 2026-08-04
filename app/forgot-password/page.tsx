"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("请输入有效邮箱地址。"); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error || "发送失败，请稍后重试。"); return; }
      setMessage("如果该邮箱已注册，我们会发送密码重置邮件。请检查收件箱和垃圾邮件。");
    } catch { setError("发送失败，请稍后重试。"); }
    finally { setLoading(false); }
  }

  return <main className="login-page"><section className="card login-card password-security-page"><h1 className="panel-title">忘记密码</h1><p className="muted">请输入已绑定的邮箱。没有绑定邮箱的子账号请联系管理员重置密码。</p><form className="grid" onSubmit={submit}><div className="field"><label htmlFor="forgot-email">邮箱</label><input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><button className="btn primary" type="submit" disabled={loading}>{loading ? "发送中…" : "发送重置邮件"}</button>{message ? <p className="success-text">{message}</p> : null}{error ? <p className="danger-text">{error}</p> : null}<Link className="btn" href="/login">返回登录</Link></form></section></main>;
}
