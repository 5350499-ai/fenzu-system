"use client";

import { useEffect } from "react";

const sentErrors = new Set<string>();

function safeText(value: unknown, limit: number) {
  const text = typeof value === "string"
    ? value
    : value instanceof Error
      ? value.message
      : "未知客户端异常";
  return text
    .replace(/(bearer|token|password|cookie)\s*[:=]\s*[^\s,]+/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s)]+/gi, "[url]")
    .slice(0, limit);
}

function report(scope: string, error: unknown, fallbackMessage = "") {
  try {
    const message = safeText(error instanceof Error ? error.message : fallbackMessage || error, 300);
    const stack = safeText(error instanceof Error ? error.stack || "" : "", 1200);
    const key = `${scope}:${message}:${stack.slice(0, 160)}`;
    if (sentErrors.has(key)) return;
    sentErrors.add(key);
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        name: error instanceof Error ? safeText(error.name, 80) : "ClientError",
        message,
        stack,
        path: window.location.pathname,
        browser: navigator.userAgent
      })
    }).catch(() => undefined);
  } catch {
    // Diagnostics must never affect the application.
  }
}

export function ClientErrorReporter() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => report("window_error", event.error, event.message);
    const handleRejection = (event: PromiseRejectionEvent) => report("unhandled_rejection", event.reason);
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
