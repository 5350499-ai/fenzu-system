import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission, requireSensitivePermission, writeAuditLog } from "@/lib/server/account-auth";
import { isAllowedAttachmentType, MAX_ATTACHMENT_FILE_SIZE } from "@/lib/attachment-file-limits";
import { getSupabaseAdmin, getSupabaseAuthVerifier } from "@/lib/supabase-admin";
import { attachmentStorageConfigs, verifyAttachmentUploadTicket } from "@/lib/server/supabase-attachment-upload";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const body = await parseJson(request) as { ticket?: string };
    if (!body.ticket) throw new AccountApiError("附件完成请求无效。", 400);
    const upload = verifyAttachmentUploadTicket(body.ticket);
    if (upload.workspaceOwnerId !== context.profile.workspace_owner_id || !isAllowedAttachmentType(upload.fileType) || upload.fileSize <= 0 || upload.fileSize > MAX_ATTACHMENT_FILE_SIZE) {
      throw new AccountApiError("附件上传凭据无效，请重新上传。", 400);
    }
    const config = attachmentStorageConfigs[upload.bucket];
    await requireModulePermission(context, "attachments", "create");
    await requireSensitivePermission(context, "can_upload_files");
    const verifier = getSupabaseAuthVerifier(context.accessToken);
    const { data: owner, error: ownerError } = await verifier.from(config.parentTable).select("id").eq("id", upload.ownerId).maybeSingle();
    if (ownerError || !owner) throw new AccountApiError("没有权限向该业务记录保存附件。", 403);

    const admin = getSupabaseAdmin();
    const { data: existing, error: existingError } = await admin.from(config.table).select("*").eq("storage_path", upload.path).maybeSingle();
    if (existingError) throw new AccountApiError("附件索引读取失败，请稍后重试。", 500);
    if (existing) return NextResponse.json({ file: existing }, { headers: { "Cache-Control": "no-store" } });

    const separator = upload.path.lastIndexOf("/");
    const directory = upload.path.slice(0, separator);
    const objectName = upload.path.slice(separator + 1);
    const { data: objects, error: objectError } = await admin.storage.from(upload.bucket).list(directory, { limit: 10, search: objectName });
    const object = (objects || []).find((item: any) => item.name === objectName) as any;
    const metadata = object?.metadata || {};
    const actualSize = Number(metadata.size || 0);
    const actualMimeType = String(metadata.mimetype || metadata.contentType || "").toLowerCase();
    if (objectError || !object || actualSize !== upload.fileSize || actualMimeType !== upload.fileType) {
      await removeOrReport(admin, upload.bucket, upload.path, upload.uploadId);
      throw new AccountApiError("私有附件核验失败，文件未保存。", 400);
    }

    const { data, error } = await admin.from(config.table).insert({
      user_id: context.profile.workspace_owner_id,
      [config.ownerColumn]: upload.ownerId,
      storage_bucket: upload.bucket,
      storage_path: upload.path,
      file_url: null,
      storage_provider: "supabase",
      provider_file_id: null,
      file_name: upload.fileName,
      file_type: upload.fileType,
      file_size: upload.fileSize,
      uploaded_at: new Date().toISOString()
    }).select("*").single();
    if (error || !data) {
      const cleaned = await removeOrReport(admin, upload.bucket, upload.path, upload.uploadId);
      throw new AccountApiError(cleaned ? "附件索引保存失败，上传文件已清理。" : "附件索引保存失败，上传文件已记录为待处理。", 500);
    }
    await writeAuditLog(context, {
      actionType: "upload_attachment", moduleKey: "attachments", entityType: config.table, entityId: data.id,
      description: `上传 Supabase 私有附件：${upload.fileName}`, logCategory: "business"
    });
    return NextResponse.json({ file: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function removeOrReport(admin: ReturnType<typeof getSupabaseAdmin>, bucket: string, path: string, uploadId: string) {
  const { error } = await admin.storage.from(bucket).remove([path]);
  if (error) console.error("supabase_attachment_orphan_cleanup_failed", { bucket, uploadId });
  return !error;
}
