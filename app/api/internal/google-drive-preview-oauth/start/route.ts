import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

const CALLBACK_PATH = "/api/internal/google-drive-preview-oauth/callback";
const PREVIEW_OAUTH_ORIGIN = "https://fenzu-system-preview-oauth-20260729-5350499-ais-projects.vercel.app";
const STATE_COOKIE = "fenzu_preview_drive_oauth_state";
const SCOPE = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return new NextResponse("Google Drive Preview 授权尚未配置。", { status: 503 });

  const state = randomBytes(32).toString("base64url");
  const callbackUrl = new URL(CALLBACK_PATH, PREVIEW_OAUTH_ORIGIN).toString();
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state
  }).toString();

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60,
    path: CALLBACK_PATH
  });
  return response;
}
