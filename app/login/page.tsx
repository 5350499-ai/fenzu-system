"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { establishSupabaseSession, isSupabaseConfigured, supabase } from "@/lib/supabase";
import { clearAccountAccessSnapshot, useAccountAccess } from "@/components/account-access";
import { AuthBrand } from "@/components/auth-brand";
import { PasswordInput } from "@/components/password-input";
import { createSaveTiming, enablePreviewTimingFromResponse, markSaveTiming, saveTimingRequestHeaders, setSaveTimingDetail, serverTimingDuration, storePendingLoginTiming } from "@/lib/save-latency-timing";

function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 15000) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then((value) => {
      window.clearTimeout(timer);
      resolve(value);
    }, (error) => {
      window.clearTimeout(timer);
      reject(error);
    });
  });
}

export default function LoginPage() {
  const router = useRouter();
  const access = useAccountAccess();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [returnTo, setReturnTo] = useState("/");
  // Read confirmation flags during the first render. Waiting for useEffect
  // allowed an implicit email-confirmation session to redirect to the home
  // page before the login screen could clear it.
  const [emailVerified] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("verified") === "1");
  const [registered] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("registered") === "1");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("returnTo") || "/";
    if (requested.startsWith("/") && !requested.startsWith("//")) setReturnTo(requested);
  }, []);

  useEffect(() => {
    if (!emailVerified || !supabase) return;
    const auth = supabase.auth;
    let active = true;
    const clearConfirmationSession = async () => {
      clearAccountAccessSnapshot();
      await auth.signOut({ scope: "local" }).catch(() => undefined);
    };
    void clearConfirmationSession();
    const { data: listener } = auth.onAuthStateChange((event) => {
      if (active && event === "SIGNED_IN") void clearConfirmationSession();
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [emailVerified]);

  useEffect(() => {
    if (!emailVerified && access.authenticated && access.isServerVerified) router.replace(returnTo);
  }, [access.authenticated, access.isServerVerified, emailVerified, returnTo, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const timing = createSaveTiming("login");
    setError("");

    if (!isSupabaseConfigured || !supabase) {
      markSaveTiming(timing, "T1");
      setError("系统尚未配置 Supabase 环境变量，请先在 Vercel 中配置登录服务。");
      return;
    }

    markSaveTiming(timing, "T1");
    setLoading(true);
    try {
      markSaveTiming(timing, "API_START");
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...saveTimingRequestHeaders(timing) },
        body: JSON.stringify({ identifier, password })
      });
      markSaveTiming(timing, "API_END");
      enablePreviewTimingFromResponse(timing, response);
      setSaveTimingDetail(timing, "serverTotalMs", serverTimingDuration(response, "total"));
      setSaveTimingDetail(timing, "serverAuthMs", serverTimingDuration(response, "auth"));
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (typeof payload?.error === "string") {
          setError(payload.error);
          return;
        }
        setError("账号或密码错误。");
        return;
      }
      clearAccountAccessSnapshot();
      const session = await withTimeout(
        establishSupabaseSession({ accessToken: payload.accessToken, refreshToken: payload.refreshToken }),
        "登录会话创建超时，请重试。"
      );
      if (!session) {
        setError("登录会话创建失败，请重试。");
        return;
      }
      markSaveTiming(timing, "SESSION_READY");
      markSaveTiming(timing, "ACCOUNT_ACCESS_START");
      const verified = await withTimeout(access.refreshWithAccessToken(payload.accessToken, timing.traceId), "账户状态验证超时，请重试。");
      markSaveTiming(timing, "ACCOUNT_ACCESS_END");
      if (!verified.authenticated || !verified.isServerVerified) {
        setError(verified.invalidReason || "登录状态验证失败，请重新登录。");
        return;
      }
      markSaveTiming(timing, "REDIRECT_START");
      storePendingLoginTiming(timing);
      router.replace(returnTo);
    } catch {
      setError("登录服务暂时不可用，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="card login-card">
        <AuthBrand />
        <form className="grid" onSubmit={submit} autoComplete="on">
          {emailVerified ? <p className="success-text" role="status">邮箱验证成功，请使用邮箱和密码登录。</p> : null}
          {registered ? <p className="success-text" role="status">验证邮件已发送，请前往邮箱完成验证后再登录。</p> : null}
          <div className="field">
            <label>登录账号或邮箱</label>
            <input name="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" placeholder="请输入登录账号或邮箱" />
          </div>
          <div className="field">
            <label>密码</label>
            <PasswordInput name="password" value={password} onValueChange={setPassword} autoComplete="current-password" />
          </div>
          <button className="btn primary" type="submit" disabled={loading} aria-busy={loading}>
          {loading ? "登录中..." : "登录系统"}
          </button>
          <Link className="login-forgot-link" href="/register">注册免费账户</Link>
          <Link className="login-forgot-link" href="/forgot-password">忘记密码？</Link>
          {error ? <p className="danger-text">{error}</p> : null}
          <p className="muted">请输入登录账号或邮箱与密码。未登录用户不能访问系统页面。</p>
        </form>
      </section>
    </main>
  );
}
