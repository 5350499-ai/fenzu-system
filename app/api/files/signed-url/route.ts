import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission, requireSensitivePermission, writeAuditLog } from "@/lib/server/account-auth";
import { getSupabaseAuthVerifier } from "@/lib/supabase-admin";

const buckets = {
  "contract-files": { table: "contract_files", view: "can_view_contract_files" },
  "rent-payment-files": { table: "rent_payment_files", view: "can_view_rent_files" },
  "expense-files": { table: "expense_files", view: "can_view_expense_files" }
} as const;

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const body = await parseJson(request) as { id?: string; bucket?: keyof typeof buckets; action?: "view" | "download" };
    const config = body.bucket ? buckets[body.bucket] : null;
    if (!config || !body.id) throw new AccountApiError("附件请求无效。", 400);
    await requireModulePermission(context, "attachments", "view");
    await requireSensitivePermission(context, config.view);
    if (body.action === "download") await requireSensitivePermission(context, "can_download_files");
    const client = getSupabaseAuthVerifier(context.accessToken);
    const { data: file, error: fileError } = await client.from(config.table).select("id,storage_path,file_name,storage_provider").eq("id", body.id).maybeSingle();
    if (fileError || !file || file.storage_provider === "google_drive" || !file.storage_path) throw new AccountApiError("没有权限访问该附件。", 403);
    const { data, error } = await client.storage.from(body.bucket!).createSignedUrl(file.storage_path, 60 * 10);
    if (error || !data?.signedUrl) throw new AccountApiError("无法生成附件访问链接。", 403);
    await writeAuditLog(context, {
      actionType: body.action === "download" ? "download_attachment" : "view_attachment",
      moduleKey: "attachments",
      entityType: config.table,
      entityId: file.id,
      description: `${body.action === "download" ? "下载" : "查看"}附件：${file.file_name}`,
      logCategory: "business"
    });
    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
