import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission, requireSensitivePermission } from "@/lib/server/account-auth";
import { createGoogleResumableUpload, DriveAttachmentKind } from "@/lib/server/google-drive";
import { getSupabaseAuthVerifier } from "@/lib/supabase-admin";
import { isAllowedAttachmentType, MAX_ATTACHMENT_FILE_SIZE, MAX_ATTACHMENT_FILE_SIZE_LABEL } from "@/lib/attachment-file-limits";

const configs = {
  "contract-files": { table: "contracts", sensitive: "can_upload_files" },
  "rent-payment-files": { table: "rent_payments", sensitive: "can_upload_files" },
  "expense-files": { table: "expenses", sensitive: "can_upload_files" }
} as const;
export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const body = await parseJson(request) as { bucket?: DriveAttachmentKind; ownerId?: string; fileName?: string; fileType?: string; fileSize?: number };
    const config = body.bucket ? configs[body.bucket] : null;
    if (!config || !body.ownerId || !body.fileName || !body.fileType || !Number.isFinite(body.fileSize)) throw new AccountApiError("附件上传请求无效。", 400);
    if (!isAllowedAttachmentType(body.fileType) || body.fileSize! <= 0 || body.fileSize! > MAX_ATTACHMENT_FILE_SIZE) throw new AccountApiError(`只支持不超过 ${MAX_ATTACHMENT_FILE_SIZE_LABEL} 的 PDF、JPG、PNG 文件。`, 400);
    await requireModulePermission(context, "attachments", "create");
    await requireSensitivePermission(context, config.sensitive);
    const verifier = getSupabaseAuthVerifier(context.accessToken);
    const { data: owner, error } = await verifier.from(config.table).select("id").eq("id", body.ownerId).maybeSingle();
    if (error || !owner) throw new AccountApiError("没有权限向该业务记录上传附件。", 403);
    const session = await createGoogleResumableUpload({
      kind: body.bucket!, ownerId: body.ownerId, fileName: body.fileName, fileType: body.fileType, fileSize: body.fileSize!
    });
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
