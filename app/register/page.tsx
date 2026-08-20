"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthBrand } from "@/components/auth-brand";

const PENDING_EMAIL_KEY = "fenzu_pending_verification_email";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  useEffect(() => {
    const pendingEmail = window.localStorage.getItem(PENDING_EMAIL_KEY);
    if (pendingEmail) {
      setEmail(pendingEmail);
      setVerificationSent(true);
    }
  }, []);

  async function checkVerification() {
    setError("");
    setVerificationMessage("");
    setCheckingVerification(true);
    try {
      const response = await fetch("/api/auth/verification-status", { method: "POST", cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.verified) {
        window.localStorage.removeItem(PENDING_EMAIL_KEY);
        window.location.replace("/login?verified=1");
        return;
      }
      setVerificationMessage(payload?.message || "邮箱尚未完成验证，请先点击邮件中的验证链接。");
    } catch {
      setVerificationMessage("暂时无法检查验证状态，请稍后再试。");
    } finally {
      setCheckingVerification(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verificationSent) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, passwordConfirmation })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || "注册暂时无法完成，请稍后重试。");
        return;
      }
      window.localStorage.setItem(PENDING_EMAIL_KEY, email.trim().toLowerCase());
      setVerificationSent(true);
      setVerificationMessage("");
    } catch {
      setError("注册服务暂时不可用，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="card login-card">
        <AuthBrand subtitle="免费单人账户" />
        <form className="grid" onSubmit={submit} autoComplete="on">
          {verificationSent ? (
            <div className="grid" role="status">
              <p className="success-text">验证邮件已发送，请前往邮箱完成验证。</p>
              <p className="muted">验证完成后点击“我已完成验证”，系统会带你返回登录页；不会自动登录。</p>
              <button className="btn primary" type="button" onClick={checkVerification} disabled={checkingVerification} aria-busy={checkingVerification}>
                {checkingVerification ? "检查中…" : "我已完成验证"}
              </button>
              {verificationMessage ? <p className="muted">{verificationMessage}</p> : null}
              <Link className="btn" href="/login">返回登录</Link>
            </div>
          ) : null}
          <div className="field">
            <label>邮箱</label>
            <input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required disabled={verificationSent} />
          </div>
          <div className="field">
            <label>密码</label>
            <input name="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={verificationSent} />
          </div>
          <div className="field">
            <label>确认密码</label>
            <input name="confirm-password" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required disabled={verificationSent} />
          </div>
          <p className="muted">免费使用：最多管理 5 套房源，每套最多 10 间房间。</p>
          {!verificationSent ? <button className="btn primary" type="submit" disabled={loading} aria-busy={loading}>{loading ? "正在创建账户..." : "注册免费账户"}</button> : null}
          {!verificationSent ? <Link className="login-forgot-link" href="/login">已有账户？去登录</Link> : null}
          {error ? <p className="danger-text" role="alert">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
