"use client";

import { getValidSupabaseSession, isSupabaseConfigured, supabase } from "./supabase";
import { isAllowedAttachmentType, MAX_ATTACHMENT_FILE_SIZE, MAX_ATTACHMENT_FILE_SIZE_LABEL } from "./attachment-file-limits";

export type StoredFile = {
  id: string;
  ownerId: string;
  tenantId: string | null;
  storageBucket: string;
  storagePath: string | null;
  fileUrl: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  storageProvider: "supabase" | "google_drive";
  providerFileId: string | null;
};

type FileConfig = {
  bucket: string;
  table: string;
  ownerColumn: string;
  ownerField: string;
  missingMessage: string;
  tenantColumn?: string;
};

export const contractFileConfig: FileConfig = {
  bucket: "contract-files",
  table: "contract_files",
  ownerColumn: "contract_id",
  ownerField: "contractId",
  tenantColumn: "tenant_id",
  missingMessage: "合同附件存储尚未初始化。请先执行 contract-files 迁移 SQL。"
};

export const expenseFileConfig: FileConfig = {
  bucket: "expense-files",
  table: "expense_files",
  ownerColumn: "expense_id",
  ownerField: "expenseId",
  missingMessage: "支出附件存储尚未初始化。请先执行 expense-files 迁移 SQL。"
};

export const rentPaymentFileConfig: FileConfig = {
  bucket: "rent-payment-files",
  table: "rent_payment_files",
  ownerColumn: "rent_payment_id",
  ownerField: "rentPaymentId",
  missingMessage: "收款附件存储尚未初始化。请先执行 rent-payment-files 迁移 SQL。"
};

export async function loadStoredFiles(config: FileConfig, ownerIds?: string[], tenantIds?: string[]): Promise<StoredFile[]> {
  if (!isSupabaseConfigured || !supabase) throw new Error("附件服务尚未配置。");
  const session = await getValidSupabaseSession();
  if (!session) throw new Error("附件读取需要有效登录会话，请刷新页面后重试。");
  const account = await loadFileAccount(session.access_token);
  if (!account.canViewAttachments || !account[viewPermissionFor(config)]) {
    throw new Error("当前账号没有查看此类附件的权限。");
  }

  const queries = [] as Array<Promise<{ data: any[] | null; error: any }>>;
  if (ownerIds?.length) queries.push(Promise.resolve(supabase.from(config.table).select("*").in(config.ownerColumn, ownerIds).order("uploaded_at", { ascending: false })));
  if (config.tenantColumn && tenantIds?.length) queries.push(Promise.resolve(supabase.from(config.table).select("*").in(config.tenantColumn, tenantIds).order("uploaded_at", { ascending: false })));
  if (!queries.length) queries.push(Promise.resolve(supabase.from(config.table).select("*").order("uploaded_at", { ascending: false })));
  const results = await Promise.all(queries);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(toFileError(error.message, config));
  const rows = [...new Map(results.flatMap((result) => result.data || []).map((row: any) => [row.id, row])).values()];
  return rows.map((row: any) => fromDb(row, config));
}

export async function uploadStoredFile(config: FileConfig, ownerId: string, sourceFile: File, options: { tenantId?: string; contractId?: string | null } = {}): Promise<StoredFile> {
  notifyAttachmentUploadProgress({ state: "preparing" });
  try {
    if (!isSupabaseConfigured || !supabase) throw new Error("Supabase 尚未配置，不能上传附件。");
    if (!ownerId) throw new Error("请先保存记录，再上传附件。");
    if (!isAllowedAttachmentType(sourceFile.type)) throw new Error("只支持 PDF、JPG、PNG 文件。");
    if (sourceFile.size > MAX_ATTACHMENT_FILE_SIZE) throw new Error(`单个附件不能超过 ${MAX_ATTACHMENT_FILE_SIZE_LABEL}，请选择更小的文件后重试。`);

    const session = await getValidSupabaseSession();
    if (!session) throw new Error("请先登录后再上传附件。");
    const account = await loadFileAccount(session.access_token);
    if (!account.canCreateAttachments || !account.canUploadFiles) throw new Error("当前账号没有上传附件权限。");

    const file = sourceFile;

    const fileName = redactSensitiveFileName(sourceFile.name);
    const payload = await postAttachmentApi("/api/files/supabase-storage/prepare", session.access_token, {
      bucket: config.bucket, ownerId, tenantId: options.tenantId, contractId: options.contractId, fileName, fileType: file.type || sourceFile.type, fileSize: file.size
    });
    notifyAttachmentUploadProgress({ state: "uploading", loaded: 0, total: file.size });
    const { error: uploadError } = await supabase.storage.from(payload.bucket).uploadToSignedUrl(payload.path, payload.token, file, {
      contentType: file.type || sourceFile.type
    });
    if (uploadError) throw new Error("私有附件上传失败，请检查网络后重试。");
    notifyAttachmentUploadProgress({ state: "saving", loaded: file.size, total: file.size });
    const completed = await postAttachmentApi("/api/files/supabase-storage/complete", session.access_token, {
      ticket: payload.ticket,
      tenantId: options.tenantId,
      contractId: options.contractId ?? null
    });
    const stored = fromDb(completed.file, config);
    notifyAttachmentUploadProgress({ state: "success", loaded: file.size, total: file.size });
    return stored;
  } catch (error) {
    notifyAttachmentUploadProgress({ state: "failed" });
    throw error;
  }
}

export async function openStoredFile(file: StoredFile) {
  if (file.storageProvider === "google_drive") {
    const blob = await getGoogleDriveBlob(file, "view");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const url = await getSignedUrl(file, "view");
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function downloadStoredFile(file: StoredFile) {
  if (file.storageProvider === "google_drive") {
    const blob = await getGoogleDriveBlob(file, "download");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const url = await getSignedUrl(file, "download");
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function deleteStoredFile(file: StoredFile) {
  if (!isSupabaseConfigured || !supabase) return;
  const session = await getValidSupabaseSession();
  if (!session) throw new Error("请先登录。");
  const account = await loadFileAccount(session.access_token);
  if (!account.canDeleteAttachments || !account.canDeleteFiles) throw new Error("当前账号没有删除附件权限。");
  if (file.storageProvider === "google_drive") {
    await postAttachmentApi("/api/files/google-drive/delete", session.access_token, { id: file.id, bucket: file.storageBucket });
    return;
  }
  if (!file.storagePath) throw new Error("历史 Supabase 附件路径无效，无法删除。");
  const { error: storageError } = await supabase.storage.from(file.storageBucket).remove([file.storagePath]);
  const table =
    file.storageBucket === "expense-files"
      ? "expense_files"
      : file.storageBucket === "rent-payment-files"
        ? "rent_payment_files"
        : "contract_files";
  const { error } = await supabase.from(table).delete().eq("id", file.id);
  if (error) throw new Error(error.message);
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fromDb(row: any, config: FileConfig): StoredFile {
  return {
    id: row.id,
    ownerId: row[config.ownerColumn],
    tenantId: row.tenant_id || null,
    storageBucket: row.storage_bucket || config.bucket,
    storagePath: row.storage_path,
    fileUrl: row.file_url || row.storage_path,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: Number(row.file_size || 0),
    uploadedAt: row.uploaded_at,
    storageProvider: row.storage_provider === "google_drive" ? "google_drive" : "supabase",
    providerFileId: row.provider_file_id || null
  };
}

async function postAttachmentApi(path: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "附件操作失败。");
  return payload;
}

type AttachmentUploadProgressState = "preparing" | "uploading" | "saving" | "success" | "failed";

function notifyAttachmentUploadProgress(detail: { state: AttachmentUploadProgressState; loaded?: number; total?: number }) {
  window.dispatchEvent(new CustomEvent("attachment-upload-progress", { detail }));
}

async function getGoogleDriveBlob(file: StoredFile, action: "view" | "download") {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase 尚未配置。");
  const session = await getValidSupabaseSession();
  if (!session) throw new Error("请先登录。");
  const response = await fetch("/api/files/google-drive/content", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ id: file.id, bucket: file.storageBucket, action })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "无法读取 Google Drive 附件。");
  }
  return response.blob();
}

async function getSignedUrl(file: StoredFile, action: "view" | "download") {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase 尚未配置。");
  const session = await getValidSupabaseSession();
  if (!session) throw new Error("请先登录。");
  if (!file.storagePath) throw new Error("历史 Supabase 附件路径无效，无法访问。");
  const response = await fetch("/api/files/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ id: file.id, bucket: file.storageBucket, action })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.signedUrl) throw new Error(payload?.error || "无法生成附件访问链接。");
  return payload.signedUrl as string;
}

type FileAccount = {
  workspaceOwnerId: string;
  canViewAttachments: boolean;
  canCreateAttachments: boolean;
  canDeleteAttachments: boolean;
  canViewContractFiles?: boolean;
  canViewRentFiles?: boolean;
  canViewExpenseFiles?: boolean;
  canDownloadFiles?: boolean;
  canUploadFiles?: boolean;
  canReplaceFiles?: boolean;
  canDeleteFiles?: boolean;
};
let cachedFileAccount: { token: string; value: FileAccount } | null = null;
async function loadFileAccount(token: string): Promise<FileAccount> {
  if (cachedFileAccount?.token === token) return cachedFileAccount.value;
  const response = await fetch("/api/accounts/me", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("当前账号权限已失效，请重新登录。");
  const payload = await response.json();
  const modules = new Map((payload.modulePermissions || []).map((item: any) => [item.moduleKey, item]));
  const attachments: any = modules.get("attachments") || {};
  const value: FileAccount = {
    workspaceOwnerId: payload.profile?.workspaceOwnerId || payload.profile?.id || "",
    canViewAttachments: Boolean(payload.isOwner || attachments.canView),
    canCreateAttachments: Boolean(payload.isOwner || attachments.canCreate),
    canDeleteAttachments: Boolean(payload.isOwner || attachments.canDelete),
    ...payload.sensitivePermissions
  };
  cachedFileAccount = { token, value };
  return value;
}

function viewPermissionFor(config: FileConfig) {
  return config.bucket === "contract-files" ? "canViewContractFiles" : config.bucket === "expense-files" ? "canViewExpenseFiles" : "canViewRentFiles";
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_").slice(0, 120) || "attachment";
}

function redactSensitiveFileName(name: string) {
  return sanitizeFileName(name).replace(/\d{6,}/g, "已隐藏号码");
}

function toFileError(message: string, config: FileConfig) {
  if (message.includes("Bucket not found") || message.includes(config.table)) return config.missingMessage;
  if (message.includes("row-level security") || message.includes("permission")) return "当前账号没有附件读写权限，请确认已登录，并已执行 Storage RLS 策略。";
  return message || "附件操作失败，请稍后重试。";
}
