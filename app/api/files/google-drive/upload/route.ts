import { NextResponse } from "next/server";

// File bytes must go directly from the browser to Google's short-lived resumable session.
export async function POST() {
  return NextResponse.json({ error: "Google Drive upload relay is disabled; use the resumable upload session." }, { status: 410 });
}
