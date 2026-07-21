"use client";

import { useEffect } from "react";

function safeErrorSummary(error: Error) {
  return error.message
    .replace(/(bearer|token|password|cookie)\s*[:=]\s*[^\s,]+/gi, "$1=[redacted]")
    .slice(0, 300);
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "global_error_boundary", message: safeErrorSummary(error), digest: error.digest || "" }),
      keepalive: true
    }).catch(() => undefined);
  }, [error]);

  function logout() {
    try {
      localStorage.removeItem("fenzu.account-access.active-account.v2");
      localStorage.removeItem("fenzu.account-access.v1");
    } catch {
      // Storage cleanup is best-effort; Supabase logout remains available on the login page.
    }
    window.location.assign("/login");
  }

  return (
    <html lang="zh-CN">
      <body>
        <main className="login-page">
          <section className="card login-card">
            <div className="brand-title">账户资料加载失败，请重新登录。</div>
            <p className="muted">系统没有显示内部错误信息。重新加载后若仍无法进入，请退出并重新登录。</p>
            <div className="modal-actions">
              <button className="btn" type="button" onClick={reset}>重新加载</button>
              <button className="btn primary" type="button" onClick={logout}>退出并重新登录</button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
