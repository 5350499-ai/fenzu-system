"use client";

import { useEffect } from "react";

function safeErrorText(value: unknown, fallback = "未知客户端异常") {
  const text = typeof value === "string" ? value : fallback;
  return text
    .replace(/(bearer|token|password|cookie)\s*[:=]\s*[^\s,]+/gi, "$1=[redacted]")
    .slice(0, 300);
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "global_error_boundary",
          name: safeErrorText(error?.name, "Error"),
          message: safeErrorText(error?.message),
          stack: safeErrorText(error?.stack, "").slice(0, 1200),
          digest: safeErrorText(error?.digest, "")
        })
      }).catch(() => undefined);
    } catch {
      // Reporting must never throw while rendering the recovery UI.
    }
  }, [error]);

  function logout() {
    try {
      const accountId = localStorage.getItem("fenzu.account-access.active-account.v2") || "";
      if (accountId) localStorage.removeItem(`fenzu.account-access.v2.${accountId}`);
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
