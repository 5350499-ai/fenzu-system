import { NextResponse } from "next/server";

const allowedEvents = /^[A-Z0-9_]+$/;

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const body = await request.json() as { event?: unknown; elapsedMs?: unknown; fileCount?: unknown; result?: unknown; name?: unknown };
    if (typeof body.event !== "string" || body.event.length > 80 || !allowedEvents.test(body.event)) return NextResponse.json({ ok: false }, { status: 400 });
    console.log("BACKUP_RUNTIME_TRACE", JSON.stringify({
      event: body.event,
      elapsedMs: typeof body.elapsedMs === "number" ? body.elapsedMs : undefined,
      fileCount: typeof body.fileCount === "number" ? body.fileCount : undefined,
      result: typeof body.result === "boolean" ? body.result : undefined,
      name: typeof body.name === "string" ? body.name.slice(0, 40) : undefined
    }));
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
}
