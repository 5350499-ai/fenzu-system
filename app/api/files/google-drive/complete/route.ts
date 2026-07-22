import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission, requireSensitivePermission, writeAuditLog } from "@/lib/server/account-auth";
import { DriveAttachmentKind, trashGoogleDriveFile, verifyGoogleUpload } from "@/lib/server/google-drive";
import { getSupabaseAdmin, getSupabaseAuthVerifier } from "@/lib/supabase-admin";
import { isAllowedAttachmentType, MAX_ATTACHMENT_FILE_SIZE, MAX_ATTACHMENT_FILE_SIZE_LABEL } from "@/lib/attachment-file-limits";

const configs = {
  "contract-files": { table: "contract_files", parentTable: "contracts", ownerColumn: "contract_id" },
  "rent-payment-files": { table: "rent_payment_files", parentTable: "rent_payments", ownerColumn: "rent_payment_id" },
  "expense-files": { table: "expense_files", parentTable: "expenses", ownerColumn: "expense_id" }
} as const;

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const body = await parseJson(request) as { bucket?: DriveAttachmentKind; ownerId?: string; fileId?: string; uploadId?: string; fileName?: string; fileType?: string; fileSize?: number };
    const config = body.bucket ? configs[body.bucket] : null;
    if (!config || !body.ownerId || !body.fileId || !body.uploadId || !body.fileName || !body.fileType || !Number.isFinite(body.fileSize)) throw new AccountApiError("附件完成请求无效。", 400);
    if (!isAllowedAttachmentType(body.fileType) || body.fileSize! <= 0 || body.fileSize! > MAX_ATTACHMENT_FILE_SIZE) throw new AccountApiError(`只支持不超过 ${MAX_ATTACHMENT_FILE_SIZE_LABEL} 的 PDF、JPG、PNG 文件。`, 400);
    await requireModulePermission(context, "attachments", "create");
    await requireSensitivePermission(context, "can_upload_files");
    const verifier = getSupabaseAuthVerifier(context.accessToken);
    const { data: owner, error: ownerError } = await verifier.from(config.parentTable).select("id").eq("id", body.ownerId).maybeSingle();
    if (ownerError || !owner) throw new AccountApiError("没有权限向该业务记录保存附件。", 403);
    const verified = await verifyGoogleUpload({
      fileId: body.fileId, kind: body.bucket!, ownerId: body.ownerId, uploadId: body.uploadId, expectedType: body.fileType, expectedSize: body.fileSize!
    });
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from(config.table).insert({
      user_id: context.profile.workspace_owner_id,
      [config.ownerColumn]: body.ownerId,
      storage_bucket: body.bucket,
      storage_path: null,
      file_url: null,
      storage_provider: "google_drive",
      provider_file_id: verified.id,
      file_name: body.fileName,
      file_type: body.fileType,
      file_size: body.fileSize,
      uploaded_at: new Date().toISOString()
    }).select("*").single();
    if (error || !data) {
      try { await trashGoogleDriveFile(verified.id); } catch { /* The file keeps its server-only upload marker for manual recovery. */ }
      throw new AccountApiError("附件索引保存失败，Google Drive 文件已移入回收站或保留待处理。", 500);
    }
    await writeAuditLog(context, {
      actionType: "upload_attachment", moduleKey: "attachments", entityType: config.table, entityId: data.id,
      description: `上传 Google Drive 附件：${body.fileName}`, logCategory: "business"
    });
    return NextResponse.json({ file: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
