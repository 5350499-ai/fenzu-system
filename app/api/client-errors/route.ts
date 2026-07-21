import { NextResponse } from "next/server";

function safeText(value: unknown, limit: number) {
  return typeof value === "string"
    ? value.replace(/(bearer|token|password|cookie)\s*[:=]\s*[^\s,]+/gi, "$1=[redacted]").slice(0, limit)
    : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    console.error("[client-error-boundary]", {
      scope: safeText(body?.scope, 80) || "unknown",
      message: safeText(body?.message, 300),
      digest: safeText(body?.digest, 120)
    });
  } catch {
    // Error reporting must never create another client-facing failure.
  }
  return new NextResponse(null, { status: 204 });
}
