import { NextResponse } from "next/server";

/**
 * The former Vercel byte relay is intentionally disabled. The active client
 * uploads directly to the short-lived Google resumable session URL returned
 * by /prepare, then calls /complete for server-side verification and indexing.
 */
export async function POST() {
  return NextResponse.json({ error: "Google Drive upload relay 已停用，请使用浏览器直传会话。" }, { status: 410 });
}
