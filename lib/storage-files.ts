"use client";

import { isSupabaseConfigured, supabase } from "./supabase";

export type StoredFile = {
  id: string;
  ownerId: string;
  storageBucket: string;
  storagePath: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
};

type FileConfig = {
  bucket: string;
  table: string;
  ownerColumn: string;
  ownerField: string;
  missingMessage: string;
};

const maxFileSize = 5 * 1024 * 1024;
const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];

export const contractFileConfig: FileConfig = {
  bucket: "contract-files",
  table: "contract_files",
  ownerColumn: "contract_id",
  ownerField: "contractId",
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

export async function loadStoredFiles(config: FileConfig, ownerIds?: string[]): Promise<StoredFile[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) return [];

  let query = supabase.from(config.table).select("*").order("uploaded_at", { ascending: false });
  if (ownerIds?.length) query = query.in(config.ownerColumn, ownerIds);
  const { data, error } = await query;
  if (error) throw new Error(toFileError(error.message, config));
  return (data || []).map((row: any) => fromDb(row, config));
}

export async function uploadStoredFile(config: FileConfig, ownerId: string, sourceFile: File): Promise<StoredFile> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase 尚未配置，不能上传附件。");
  if (!ownerId) throw new Error("请先保存记录，再上传附件。");
  if (!allowedTypes.includes(sourceFile.type)) throw new Error("只支持 PDF、JPG、PNG 文件。");
  if (sourceFile.size > maxFileSize) throw new Error("单个附件不能超过 5MB。");

  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) throw new Error("请先登录后再上传附件。");

  const file = sourceFile.type.startsWith("image/") ? await compressImage(sourceFile) : sourceFile;
  if (file.size > maxFileSize) throw new Error("压缩后文件仍超过 5MB，请选择更小的文件。");

  const fileId = crypto.randomUUID();
  const storagePath = `${session.user.id}/${ownerId}/${fileId}-${sanitizeFileName(sourceFile.name)}`;
  const { error: uploadError } = await supabase.storage.from(config.bucket).upload(storagePath, file, {
    contentType: file.type || sourceFile.type,
    upsert: false
  });
  if (uploadError) throw new Error(toFileError(uploadError.message, config));

  const row = {
    id: fileId,
    user_id: session.user.id,
    [config.ownerColumn]: ownerId,
    storage_bucket: config.bucket,
    storage_path: storagePath,
    file_url: storagePath,
    file_name: sourceFile.name,
    file_type: file.type || sourceFile.type,
    file_size: file.size,
    uploaded_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from(config.table).insert(row).select("*").single();
  if (error) {
    await supabase.storage.from(config.bucket).remove([storagePath]);
    throw new Error(toFileError(error.message, config));
  }
  return fromDb(data, config);
}

export async function openStoredFile(file: StoredFile) {
  const url = await getSignedUrl(file);
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function downloadStoredFile(file: StoredFile) {
  const url = await getSignedUrl(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function deleteStoredFile(file: StoredFile) {
  if (!isSupabaseConfigured || !supabase) return;
  const { error: storageError } = await supabase.storage.from(file.storageBucket).remove([file.storagePath]);
  if (storageError) throw new Error(storageError.message);
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
    storageBucket: row.storage_bucket || config.bucket,
    storagePath: row.storage_path,
    fileUrl: row.file_url || row.storage_path,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: Number(row.file_size || 0),
    uploadedAt: row.uploaded_at
  };
}

async function getSignedUrl(file: StoredFile) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase 尚未配置。");
  const { data, error } = await supabase.storage.from(file.storageBucket).createSignedUrl(file.storagePath, 60 * 10);
  if (error || !data?.signedUrl) throw new Error(error?.message || "无法生成附件访问链接。");
  return data.signedUrl;
}

async function compressImage(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  if (file.size <= 1024 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], replaceImageExtension(file.name), { type: "image/jpeg", lastModified: Date.now() });
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_").slice(0, 120) || "attachment";
}

function replaceImageExtension(name: string) {
  return name.replace(/\.(png|jpg|jpeg)$/i, ".jpg") || "attachment.jpg";
}

function toFileError(message: string, config: FileConfig) {
  if (message.includes("Bucket not found") || message.includes(config.table)) return config.missingMessage;
  if (message.includes("row-level security") || message.includes("permission")) return "当前账号没有附件读写权限，请确认已登录，并已执行 Storage RLS 策略。";
  return message || "附件操作失败，请稍后重试。";
}
