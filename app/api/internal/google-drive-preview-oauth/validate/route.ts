import { NextResponse } from "next/server";

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export const dynamic = "force-dynamic";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!clientId || !clientSecret || !refreshToken || !rootFolderId) {
    return NextResponse.json({ error: "Preview Google Drive configuration is incomplete." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const token = await tokenResponse.json().catch(() => null) as { access_token?: string } | null;
  if (!tokenResponse.ok || !token?.access_token) {
    return NextResponse.json({ error: "Preview Google Drive authorization could not be refreshed." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  const folderResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(rootFolderId)}?fields=id,mimeType,trashed`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store"
  });
  const folder = await folderResponse.json().catch(() => null) as { mimeType?: string; trashed?: boolean } | null;
  if (!folderResponse.ok || folder?.mimeType !== DRIVE_FOLDER_MIME_TYPE || folder.trashed) {
    return NextResponse.json({ error: "Preview Google Drive test folder is unavailable." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ accessTokenExchange: "ok", previewDriveFolderAccess: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
