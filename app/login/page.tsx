"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("123456");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.localStorage.setItem("demo-auth", JSON.stringify({ email }));
    router.push("/");
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
            登录系统
          </button>
          <p className="muted">
            当前为本地演示登录。接入 Supabase 环境变量后，可替换为真实邮箱登录。
          </p>
        </form>
      </section>
    </main>
  );
}
