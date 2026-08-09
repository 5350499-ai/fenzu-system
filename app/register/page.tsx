"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { useState } from "react";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

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
      setVerificationSent(true);
    } catch {
      setError("注册服务暂时不可用，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="card login-card">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark"><Building2 size={22} /></div>
          <div>
            <div className="brand-title">分租房管理系统</div>
            <div className="brand-subtitle">免费单人账户</div>
          </div>
        </div>
        <form className="grid" onSubmit={submit} autoComplete="on">
          {verificationSent ? (
            <p className="success-text" role="status">
              验证邮件已发送，请前往邮箱完成验证。验证成功后再返回登录。
            </p>
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
          <p className="muted">免费使用：最多管理 5 套未归档房源，每套最多 10 间未归档房间。</p>
          <button className="btn primary" type="submit" disabled={loading || verificationSent} aria-busy={loading}>
            {verificationSent ? "等待邮箱验证" : loading ? "正在创建账户..." : "注册免费账户"}
          </button>
          <Link className="login-forgot-link" href="/login">已有账户？去登录</Link>
          {error ? <p className="danger-text" role="alert">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
