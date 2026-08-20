"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AuthBrand } from "@/components/auth-brand";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

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
      setMessage("重置邮件已发送，请检查收件箱和垃圾邮件。");
      setCooldown(90);
    } catch { setError("发送失败，请稍后重试。"); }
    finally { setLoading(false); }
  }

  const buttonLabel = loading ? "发送中…" : cooldown > 0 ? `${cooldown} 秒后可重新发送` : message ? "重新发送重置邮件" : "发送重置邮件";
  return <main className="login-page"><section className="card login-card password-security-page"><AuthBrand subtitle="密码找回" /><h1 className="panel-title">忘记密码</h1><p className="muted">请输入已绑定的邮箱。没有绑定邮箱的子账号请联系管理员重置密码。</p><form className="grid" onSubmit={submit}><div className="field"><label htmlFor="forgot-email">邮箱</label><input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><button className="btn primary" type="submit" disabled={loading || cooldown > 0}>{buttonLabel}</button>{message ? <p className="success-text">{message}</p> : null}{error ? <p className="danger-text">{error}</p> : null}<Link className="btn" href="/login">返回登录</Link></form></section></main>;
}
