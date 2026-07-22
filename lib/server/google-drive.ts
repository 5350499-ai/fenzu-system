import "server-only";

import { randomUUID } from "crypto";
import { AccountApiError } from "@/lib/server/account-auth";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const ROOT_FOLDER_NAME = "分租管理";

export type DriveAttachmentKind = "contract-files" | "rent-payment-files" | "expense-files";

const kindLabels: Record<DriveAttachmentKind, string> = {
  "contract-files": "合同附件",
  "rent-payment-files": "收款附件",
  "expense-files": "支出附件"
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
};

function requiredConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!clientId || !clientSecret || !refreshToken || !rootFolderId) {
    throw new AccountApiError("Google Drive 尚未授权或尚未配置。请联系主管理员完成 Google Drive 授权。", 503);
  }
  return { clientId, clientSecret, refreshToken, rootFolderId };
}

export async function getGoogleAccessToken() {
  const { clientId, clientSecret, refreshToken } = requiredConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null) as { access_token?: string; error?: string } | null;
  if (!response.ok || !payload?.access_token) {
    if (payload?.error === "invalid_grant") {
      throw new AccountApiError("Google Drive 需要重新授权。新的附件不会上传，历史 Supabase 附件仍可读取。", 503);
    }
    throw new AccountApiError("Google Drive 授权暂时不可用，请稍后重试。", 503);
  }
  return payload.access_token;
}

async function driveJson<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    cache: "no-store"
  });
  if (!response.ok) throw new AccountApiError("Google Drive 文件操作失败，请稍后重试。", response.status === 404 ? 404 : 502);
  return response.json() as Promise<T>;
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(token: string, parentId: string, kind: string, ownerId?: string) {
  const conditions = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `'${escapeDriveQuery(parentId)}' in parents`,
    `appProperties has { key='fenzu_kind' and value='${escapeDriveQuery(kind)}' }`
  ];
  if (ownerId) conditions.push(`appProperties has { key='fenzu_owner_id' and value='${escapeDriveQuery(ownerId)}' }`);
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(conditions.join(" and "))}&fields=${encodeURIComponent("files(id,name)")}&pageSize=1`;
  const result = await driveJson<{ files?: DriveFile[] }>(token, url);
  return result.files?.[0] || null;
}

async function createFolder(token: string, parentId: string, name: string, kind: string, ownerId?: string) {
  return driveJson<DriveFile>(token, DRIVE_API + "/files?fields=id,name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
      appProperties: { fenzu_kind: kind, ...(ownerId ? { fenzu_owner_id: ownerId } : {}) }
    })
  });
}

async function getOrCreateFolder(token: string, parentId: string, name: string, kind: string, ownerId?: string) {
  const existing = await findFolder(token, parentId, kind, ownerId);
  return existing || createFolder(token, parentId, name, kind, ownerId);
}

export async function ensureDriveAttachmentFolder(kind: DriveAttachmentKind, ownerId: string) {
  const token = await getGoogleAccessToken();
  const { rootFolderId } = requiredConfig();
  const category = await getOrCreateFolder(token, rootFolderId, kindLabels[kind], kind);
  const recordFolder = await getOrCreateFolder(token, category.id, ownerId, `${kind}:record`, ownerId);
  return { token, rootFolderId, folderId: recordFolder.id };
}

export async function createGoogleResumableUpload(input: {
  kind: DriveAttachmentKind;
  ownerId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}) {
  const { token, folderId } = await ensureDriveAttachmentFolder(input.kind, input.ownerId);
  const uploadId = randomUUID();
  const safeName = sanitizeFileName(input.fileName);
  const response = await fetch(`${DRIVE_UPLOAD_API}?uploadType=resumable&fields=id,name,mimeType,size,parents,appProperties`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.fileType,
      "X-Upload-Content-Length": String(input.fileSize)
    },
    body: JSON.stringify({
      name: safeName,
      mimeType: input.fileType,
      parents: [folderId],
      appProperties: {
        fenzu_kind: input.kind,
        fenzu_owner_id: input.ownerId,
        fenzu_upload_id: uploadId
      }
    }),
    cache: "no-store"
  });
  const uploadUrl = response.headers.get("location");
  if (!response.ok || !uploadUrl) throw new AccountApiError("无法开始 Google Drive 上传，请稍后重试。", 502);
  return { uploadId, uploadUrl };
}

export async function verifyGoogleUpload(input: {
  fileId: string;
  kind: DriveAttachmentKind;
  ownerId: string;
  uploadId: string;
  expectedType: string;
  expectedSize: number;
}) {
  const token = await getGoogleAccessToken();
  const file = await driveJson<DriveFile>(token, `${DRIVE_API}/files/${encodeURIComponent(input.fileId)}?fields=${encodeURIComponent("id,name,mimeType,size,parents,trashed,appProperties")}`);
  const { folderId } = await ensureDriveAttachmentFolder(input.kind, input.ownerId);
  const properties = file.appProperties || {};
  if (
    file.trashed ||
    file.mimeType !== input.expectedType ||
    Number(file.size || 0) !== input.expectedSize ||
    !file.parents?.includes(folderId) ||
    properties.fenzu_kind !== input.kind ||
    properties.fenzu_owner_id !== input.ownerId ||
    properties.fenzu_upload_id !== input.uploadId
  ) {
    throw new AccountApiError("Google Drive 上传核验失败，附件未保存。", 400);
  }
  return file;
}

export async function stampGoogleUpload(input: {
  fileId: string;
  kind: DriveAttachmentKind;
  ownerId: string;
  uploadId: string;
}) {
  const token = await getGoogleAccessToken();
  await driveJson<DriveFile>(token, `${DRIVE_API}/files/${encodeURIComponent(input.fileId)}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appProperties: {
        fenzu_kind: input.kind,
        fenzu_owner_id: input.ownerId,
        fenzu_upload_id: input.uploadId
      }
    })
  });
}

export async function trashGoogleDriveFile(fileId: string) {
  const token = await getGoogleAccessToken();
  await driveJson<DriveFile>(token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,trashed`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true })
  });
}

export async function restoreGoogleDriveFile(fileId: string) {
  const token = await getGoogleAccessToken();
  await driveJson<DriveFile>(token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,trashed`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: false })
  });
}

export async function getGoogleDriveContent(fileId: string) {
  const token = await getGoogleAccessToken();
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok || !response.body) throw new AccountApiError("无法读取 Google Drive 附件。", response.status === 404 ? 404 : 502);
  return response;
}

function sanitizeFileName(name: string) {
  return name.replace(/[\r\n]/g, "_").replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_").slice(0, 120) || "attachment";
}

export { ROOT_FOLDER_NAME };
