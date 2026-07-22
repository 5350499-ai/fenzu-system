import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission, requireSensitivePermission, writeAuditLog } from "@/lib/server/account-auth";
import { restoreGoogleDriveFile, trashGoogleDriveFile } from "@/lib/server/google-drive";
import { getSupabaseAdmin, getSupabaseAuthVerifier } from "@/lib/supabase-admin";

const configs = {
  "contract-files": { table: "contract_files" },
  "rent-payment-files": { table: "rent_payment_files" },
  "expense-files": { table: "expense_files" }
} as const;

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const body = await parseJson(request) as { bucket?: keyof typeof configs; id?: string };
    const config = body.bucket ? configs[body.bucket] : null;
    if (!config || !body.id) throw new AccountApiError("附件删除请求无效。", 400);
    await requireModulePermission(context, "attachments", "delete");
    await requireSensitivePermission(context, "can_delete_files");
    const verifier = getSupabaseAuthVerifier(context.accessToken);
    const { data: file, error: fileError } = await verifier.from(config.table).select("id,provider_file_id,file_name,storage_provider").eq("id", body.id).maybeSingle();
    if (fileError || !file || file.storage_provider !== "google_drive" || !file.provider_file_id) throw new AccountApiError("没有权限删除该 Google Drive 附件。", 403);
    await trashGoogleDriveFile(file.provider_file_id);
    const admin = getSupabaseAdmin();
    const { error } = await admin.from(config.table).delete().eq("id", file.id);
    if (error) {
      try { await restoreGoogleDriveFile(file.provider_file_id); } catch { /* Keep an explicit recoverable mismatch rather than permanently deleting. */ }
      throw new AccountApiError("附件索引删除失败，文件已尝试恢复。请稍后重试。", 500);
    }
    await writeAuditLog(context, {
      actionType: "trash_attachment", moduleKey: "attachments", entityType: config.table, entityId: file.id,
      description: `将 Google Drive 附件移入回收站：${file.file_name}`, logCategory: "business"
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
