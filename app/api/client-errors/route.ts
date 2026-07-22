import { NextResponse } from "next/server";

function safeText(value: unknown, limit: number) {
  return typeof value === "string"
    ? value.replace(/(bearer|token|password|cookie)\s*[:=]\s*[^\s,]+/gi, "$1=[redacted]").slice(0, limit)
    : "";
}

function safePath(value: unknown) {
  const path = safeText(value, 240);
  return path.startsWith("/") && !path.includes("?") ? path : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    console.error("[client-error-boundary]", {
      scope: safeText(body?.scope, 80) || "unknown",
      name: safeText(body?.name, 80),
      message: safeText(body?.message, 300),
      stack: safeText(body?.stack, 1200),
      digest: safeText(body?.digest, 120),
      path: safePath(body?.path),
      browser: safeText(body?.browser, 220)
    });
  } catch {
    // Error reporting must never create another client-facing failure.
  }
  return new NextResponse(null, { status: 204 });
}
