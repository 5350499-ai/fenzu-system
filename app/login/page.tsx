"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!isSupabaseConfigured || !supabase) {
      setError("系统尚未配置 Supabase 环境变量，请先在 Vercel 中配置登录服务。");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "账号或密码错误。");
        return;
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: payload.accessToken,
        refresh_token: payload.refreshToken
      });
      if (sessionError) {
        setError("登录会话创建失败，请重试。");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("登录服务暂时不可用，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="card login-card">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark">
            <Building2 size={22} />
          </div>
          <div>
            <div className="brand-title">西班牙分租房管理系统</div>
            <div className="brand-subtitle">V1 分租管理优先</div>
          </div>
        </div>
        <form className="grid" onSubmit={submit}>
          <div className="field">
            <label>登录账号或邮箱</label>
            <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" placeholder="请输入登录账号或邮箱" />
          </div>
          <div className="field">
            <label>密码</label>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
          </div>
          <button className="btn primary" type="submit">
            {loading ? "登录中..." : "登录系统"}
          </button>
          {error ? <p className="danger-text">{error}</p> : null}
          <p className="muted">请输入登录账号或邮箱与密码。未登录用户不能访问系统页面。</p>
        </form>
      </section>
    </main>
  );
}
