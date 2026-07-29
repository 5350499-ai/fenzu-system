import { NextResponse } from "next/server";

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const PREVIEW_BRANCH = "fix/attachment-reload-display";
const PREVIEW_ROOT_KEY = "GOOGLE_DRIVE_ROOT_FOLDER_ID";
const PROJECT_ID = "prj_jGbIJC06B9stKAnFRcs5v4x7UDnT";
const TEAM_ID = "team_DERfJNyjaHLVEpmSkH0MNnPT";

type DriveFolder = { id?: string };
type VercelEnvironment = { id?: string; key?: string; target?: string | string[]; gitBranch?: string };

async function listFolders(token: string, query: string) {
  const response = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null) as { files?: DriveFolder[] } | null;
  return response.ok ? payload?.files || [] : [];
}

function previewTarget(target: VercelEnvironment["target"]) {
  return Array.isArray(target) ? target.includes("preview") : target === "preview";
}

async function replacePreviewRootFolderId(value: string) {
  const automationToken = process.env.VERCEL_AUTOMATION_BEARER;
  if (!automationToken) throw new Error("missing Preview automation credential");
  const api = `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`;
  const headers = { Authorization: `Bearer ${automationToken}`, "Content-Type": "application/json" };
  const existingResponse = await fetch(api, { headers, cache: "no-store" });
  if (!existingResponse.ok) throw new Error("could not read Preview environment metadata");
  const existing = await existingResponse.json() as { envs?: VercelEnvironment[] };
  const overrides = (existing.envs || []).filter((item) => item.key === PREVIEW_ROOT_KEY && item.gitBranch === PREVIEW_BRANCH && previewTarget(item.target));
  for (const item of overrides) {
    if (!item.id) continue;
    const deleted = await fetch(`https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${item.id}?teamId=${TEAM_ID}`, { method: "DELETE", headers, cache: "no-store" });
    if (!deleted.ok) throw new Error("could not replace Preview test-folder configuration");
  }
  const created = await fetch(api, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({ key: PREVIEW_ROOT_KEY, value, type: "encrypted", target: ["preview"], gitBranch: PREVIEW_BRANCH })
  });
  if (!created.ok) throw new Error("could not save Preview test-folder configuration");
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
  const accessToken = token.access_token;

  const tokenInfoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, { cache: "no-store" });
  const tokenInfo = await tokenInfoResponse.json().catch(() => null) as { scope?: string } | null;
  const grantedScopes = new Set((tokenInfo?.scope || "").split(" "));
  const hasDriveFileScope = grantedScopes.has("https://www.googleapis.com/auth/drive.file");
  const hasDriveMetadataScope = grantedScopes.has("https://www.googleapis.com/auth/drive.metadata.readonly");
  const managementFolders = await listFolders(accessToken, `name = '分租管理' and mimeType = '${DRIVE_FOLDER_MIME_TYPE}' and trashed = false`);
  const previewFolders = (await Promise.all(managementFolders.map((folder) => folder.id
    ? listFolders(accessToken, `'${folder.id}' in parents and name = 'Preview测试' and mimeType = '${DRIVE_FOLDER_MIME_TYPE}' and trashed = false`)
    : Promise.resolve([])))).flat();
  const uniquePreviewTestFolder = previewFolders.length === 1 ? previewFolders[0] : null;
  const configuredRootMatchesPreviewTest = uniquePreviewTestFolder?.id === rootFolderId;
  const repairRequested = new URL(request.url).searchParams.get("repair") === "1";
  if (repairRequested && uniquePreviewTestFolder?.id && !configuredRootMatchesPreviewTest) {
    try {
      await replacePreviewRootFolderId(uniquePreviewTestFolder.id);
      return NextResponse.json({ previewRootFolderUpdated: true, redeployRequired: true }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ error: "Preview test-folder configuration could not be updated." }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
  }

  const folderResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(rootFolderId)}?fields=id,mimeType,trashed`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  const folder = await folderResponse.json().catch(() => null) as { mimeType?: string; trashed?: boolean } | null;
  if (!folderResponse.ok || folder?.mimeType !== DRIVE_FOLDER_MIME_TYPE || folder.trashed) {
    const reason = !folderResponse.ok
      ? `Drive folder request returned ${folderResponse.status}.`
      : folder?.trashed
        ? "Drive folder is in trash."
        : "Drive root is not a folder.";
    return NextResponse.json({ error: "Preview Google Drive test folder is unavailable.", reason, hasDriveFileScope, hasDriveMetadataScope, uniquePreviewTestFolderFound: Boolean(uniquePreviewTestFolder), configuredRootMatchesPreviewTest }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ accessTokenExchange: "ok", previewDriveFolderAccess: "ok", hasDriveFileScope, hasDriveMetadataScope, uniquePreviewTestFolderFound: Boolean(uniquePreviewTestFolder), configuredRootMatchesPreviewTest }, { headers: { "Cache-Control": "no-store" } });
}
