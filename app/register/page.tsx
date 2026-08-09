"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      router.replace(`/login?registered=1&identifier=${encodeURIComponent(email.trim())}`);
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
          <div className="field"><label>邮箱</label><input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required /></div>
          <div className="field"><label>密码</label><input name="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          <div className="field"><label>确认密码</label><input name="confirm-password" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required /></div>
          <p className="muted">免费使用：最多管理 5 套未归档房源，每套最多 10 间未归档房间。</p>
          <button className="btn primary" type="submit" disabled={loading} aria-busy={loading}>{loading ? "正在创建账户..." : "注册免费账户"}</button>
          <Link className="login-forgot-link" href="/login">已有账户？去登录</Link>
          {error ? <p className="danger-text" role="alert">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
