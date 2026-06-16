"use client";

import { isSupabaseConfigured, supabase } from "./supabase";

export type ContractFile = {
  id: string;
  contractId: string;
  storageBucket: string;
  storagePath: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
};

const bucketName = "contract-files";
const maxFileSize = 5 * 1024 * 1024;
const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];

export async function loadContractFiles(contractIds?: string[]): Promise<ContractFile[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) return [];

  let query = supabase.from("contract_files").select("*").order("uploaded_at", { ascending: false });
  if (contractIds?.length) query = query.in("contract_id", contractIds);
  const { data, error } = await query;
  if (error) throw new Error(toFileError(error.message));
  return (data || []).map((row: any) => ({
    id: row.id,
    contractId: row.contract_id,
    storageBucket: row.storage_bucket || bucketName,
    storagePath: row.storage_path,
    fileUrl: row.file_url || row.storage_path,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: Number(row.file_size || 0),
    uploadedAt: row.uploaded_at
  }));
}

export async function uploadContractFile(contractId: string, sourceFile: File): Promise<ContractFile> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase 尚未配置，不能上传合同附件。");
  }
  if (!contractId) throw new Error("请先保存合同，再上传附件。");
  if (!allowedTypes.includes(sourceFile.type)) throw new Error("只支持 PDF、JPG、PNG 文件。");
  if (sourceFile.size > maxFileSize) throw new Error("单个附件不能超过 5MB。");

  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) throw new Error("请先登录后再上传附件。");

  const file = sourceFile.type.startsWith("image/") ? await compressImage(sourceFile) : sourceFile;
  if (file.size > maxFileSize) throw new Error("压缩后文件仍超过 5MB，请选择更小的文件。");

  const fileId = crypto.randomUUID();
  const safeName = sanitizeFileName(sourceFile.name);
  const storagePath = `${session.user.id}/${contractId}/${fileId}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, file, {
    contentType: file.type || sourceFile.type,
    upsert: false
  });
  if (uploadError) throw new Error(toFileError(uploadError.message));

  const row = {
    id: fileId,
    user_id: session.user.id,
    contract_id: contractId,
    storage_bucket: bucketName,
    storage_path: storagePath,
    file_url: storagePath,
    file_name: sourceFile.name,
    file_type: file.type || sourceFile.type,
    file_size: file.size,
    uploaded_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from("contract_files").insert(row).select("*").single();
  if (error) {
    await supabase.storage.from(bucketName).remove([storagePath]);
    throw new Error(toFileError(error.message));
  }

  return {
    id: data.id,
    contractId: data.contract_id,
    storageBucket: data.storage_bucket,
    storagePath: data.storage_path,
    fileUrl: data.file_url || data.storage_path,
    fileName: data.file_name,
    fileType: data.file_type,
    fileSize: Number(data.file_size || 0),
    uploadedAt: data.uploaded_at
  };
}

export async function openContractFile(file: ContractFile) {
  const url = await getSignedUrl(file);
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function downloadContractFile(file: ContractFile) {
  const url = await getSignedUrl(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function deleteContractFile(file: ContractFile) {
  if (!isSupabaseConfigured || !supabase) return;
  const { error: storageError } = await supabase.storage.from(bucketName).remove([file.storagePath]);
  if (storageError) throw new Error(toFileError(storageError.message));
  const { error } = await supabase.from("contract_files").delete().eq("id", file.id);
  if (error) throw new Error(toFileError(error.message));
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function getSignedUrl(file: ContractFile) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase 尚未配置。");
  const { data, error } = await supabase.storage.from(file.storageBucket || bucketName).createSignedUrl(file.storagePath, 60 * 10, {
    download: false
  });
  if (error || !data?.signedUrl) throw new Error(toFileError(error?.message || "无法生成附件访问链接。"));
  return data.signedUrl;
}

async function compressImage(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  if (file.size <= 1024 * 1024) return file;

  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], replaceImageExtension(file.name), { type: "image/jpeg", lastModified: Date.now() });
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_").slice(0, 120) || "contract-file";
}

function replaceImageExtension(name: string) {
  return name.replace(/\.(png|jpg|jpeg)$/i, ".jpg") || "contract-image.jpg";
}

function toFileError(message: string) {
  if (message.includes("Bucket not found") || message.includes("contract_files")) {
    return "合同附件存储尚未初始化。请先在 Supabase SQL Editor 执行 contract-files 迁移 SQL。";
  }
  if (message.includes("row-level security") || message.includes("permission")) {
    return "当前账号没有附件读写权限，请确认已登录，并已执行 Storage RLS 策略。";
  }
  return message || "附件操作失败，请稍后重试。";
}
