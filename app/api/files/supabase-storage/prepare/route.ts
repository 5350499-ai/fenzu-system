import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission, requireSensitivePermission } from "@/lib/server/account-auth";
import { isAllowedAttachmentType, MAX_ATTACHMENT_FILE_SIZE, MAX_ATTACHMENT_FILE_SIZE_LABEL } from "@/lib/attachment-file-limits";
import { getSupabaseAdmin, getSupabaseAuthVerifier } from "@/lib/supabase-admin";
import { attachmentStorageConfigs, AttachmentStorageBucket, createAttachmentUploadTicket } from "@/lib/server/supabase-attachment-upload";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const body = await parseJson(request) as { bucket?: AttachmentStorageBucket; ownerId?: string; fileName?: string; fileType?: string; fileSize?: number };
    const config = body.bucket ? attachmentStorageConfigs[body.bucket] : null;
    if (!config || !body.ownerId || !body.fileName || !body.fileType || !Number.isFinite(body.fileSize)) throw new AccountApiError("附件上传请求无效。", 400);
    if (!isAllowedAttachmentType(body.fileType) || body.fileSize! <= 0 || body.fileSize! > MAX_ATTACHMENT_FILE_SIZE) {
      throw new AccountApiError(`只支持不超过 ${MAX_ATTACHMENT_FILE_SIZE_LABEL} 的 PDF、JPG、PNG 文件。`, 400);
    }
    await requireModulePermission(context, "attachments", "create");
    await requireSensitivePermission(context, "can_upload_files");
    const verifier = getSupabaseAuthVerifier(context.accessToken);
    const { data: owner, error } = await verifier.from(config.parentTable).select("id").eq("id", body.ownerId).maybeSingle();
    if (error || !owner) throw new AccountApiError("没有权限向该业务记录上传附件。", 403);
    const upload = createAttachmentUploadTicket({
      workspaceOwnerId: context.profile.workspace_owner_id,
      bucket: body.bucket!,
      ownerId: body.ownerId,
      fileName: body.fileName,
      fileType: body.fileType,
      fileSize: body.fileSize!
    });
    const { data, error: uploadError } = await getSupabaseAdmin().storage.from(upload.bucket).createSignedUploadUrl(upload.path);
    if (uploadError || !data?.token) throw new AccountApiError("无法准备私有附件上传，请稍后重试。", 502);
    return NextResponse.json({ bucket: upload.bucket, path: upload.path, token: data.token, ticket: upload.ticket }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
