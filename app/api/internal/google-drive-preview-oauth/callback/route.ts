import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const CALLBACK_PATH = "/api/internal/google-drive-preview-oauth/callback";
const STATE_COOKIE = "fenzu_preview_drive_oauth_state";
const PREVIEW_BRANCH = "fix/attachment-reload-display";
const PREVIEW_TOKEN_KEY = "GOOGLE_REFRESH_TOKEN";
const PROJECT_ID = "prj_jGbIJC06B9stKAnFRcs5v4x7UDnT";
const TEAM_ID = "team_DERfJNyjaHLVEpmSkH0MNnPT";

type VercelEnvironment = {
  id?: string;
  key?: string;
  target?: string | string[];
  gitBranch?: string;
};

function sameState(expected: string | undefined, received: string | null) {
  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function previewTarget(target: VercelEnvironment["target"]) {
  return Array.isArray(target) ? target.includes("preview") : target === "preview";
}

function response(message: string, status = 200) {
  const result = new NextResponse(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Google Drive Preview 授权</title><body><p>${message}</p></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
  result.cookies.set(STATE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", maxAge: 0, path: CALLBACK_PATH });
  return result;
}

async function replacePreviewRefreshToken(token: string) {
  const automationToken = process.env.VERCEL_AUTOMATION_BEARER;
  if (!automationToken) throw new Error("missing Vercel automation credential");
  const api = `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`;
  const headers = { Authorization: `Bearer ${automationToken}`, "Content-Type": "application/json" };
  const existingResponse = await fetch(api, { headers, cache: "no-store" });
  if (!existingResponse.ok) throw new Error("could not read Preview environment metadata");
  const existing = await existingResponse.json() as { envs?: VercelEnvironment[] };
  const overrides = (existing.envs || []).filter((item) => item.key === PREVIEW_TOKEN_KEY && item.gitBranch === PREVIEW_BRANCH && previewTarget(item.target));
  for (const item of overrides) {
    if (!item.id) continue;
    const deleted = await fetch(`https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${item.id}?teamId=${TEAM_ID}`, { method: "DELETE", headers, cache: "no-store" });
    if (!deleted.ok) throw new Error("could not replace Preview refresh token");
  }
  const created = await fetch(api, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({ key: PREVIEW_TOKEN_KEY, value: token, type: "encrypted", target: ["preview"], gitBranch: PREVIEW_BRANCH })
  });
  if (!created.ok) throw new Error("could not save Preview refresh token");
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const store = await cookies();
  if (!sameState(store.get(STATE_COOKIE)?.value, url.searchParams.get("state"))) return response("授权请求无效或已过期，请重新打开授权链接。", 400);
  const error = url.searchParams.get("error");
  if (error) return response("Google Drive 授权未完成。请关闭此页面后重新打开授权链接。", 400);
  const code = url.searchParams.get("code");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!code || !clientId || !clientSecret) return response("Preview 授权配置不完整，请联系管理员。", 503);

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: new URL(CALLBACK_PATH, request.url).toString(),
        grant_type: "authorization_code"
      })
    });
    const tokenPayload = await tokenResponse.json().catch(() => null) as { refresh_token?: string } | null;
    if (!tokenResponse.ok || !tokenPayload?.refresh_token) return response("Google Drive 未返回新的授权记录，请关闭页面后重新开始。", 502);
    await replacePreviewRefreshToken(tokenPayload.refresh_token);
    return response("Google Drive Preview 授权已完成。可以关闭此页面。新的 Preview 正在由管理员重新部署。");
  } catch {
    return response("Preview 授权保存失败，请联系管理员重新开始。", 502);
  }
}
