"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@test.com");
  const [password, setPassword] = useState("123456");
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
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    setLoading(false);

    if (loginError) {
      setError("登录失败，请检查邮箱和密码是否正确。");
      return;
    }

    router.replace("/");
    router.refresh();
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
            <label>邮箱</label>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
          </div>
          <div className="field">
            <label>密码</label>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
          </div>
          <button className="btn primary" type="submit">
            {loading ? "登录中..." : "登录系统"}
          </button>
          {error ? <p className="danger-text">{error}</p> : null}
          <p className="muted">请输入管理员邮箱和密码。未登录用户不能访问系统页面。</p>
        </form>
      </section>
    </main>
  );
}
