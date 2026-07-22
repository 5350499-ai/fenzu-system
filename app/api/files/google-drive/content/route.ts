import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission, requireSensitivePermission, writeAuditLog } from "@/lib/server/account-auth";
import { getGoogleDriveContent } from "@/lib/server/google-drive";
import { getSupabaseAuthVerifier } from "@/lib/supabase-admin";

const configs = {
  "contract-files": { table: "contract_files", view: "can_view_contract_files" },
  "rent-payment-files": { table: "rent_payment_files", view: "can_view_rent_files" },
  "expense-files": { table: "expense_files", view: "can_view_expense_files" }
} as const;

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const body = await parseJson(request) as { bucket?: keyof typeof configs; id?: string; action?: "view" | "download" };
    const config = body.bucket ? configs[body.bucket] : null;
    if (!config || !body.id) throw new AccountApiError("附件请求无效。", 400);
    await requireModulePermission(context, "attachments", "view");
    await requireSensitivePermission(context, config.view);
    if (body.action === "download") await requireSensitivePermission(context, "can_download_files");
    const verifier = getSupabaseAuthVerifier(context.accessToken);
    const { data: file, error } = await verifier.from(config.table).select("id,provider_file_id,file_name,file_type,storage_provider").eq("id", body.id).maybeSingle();
    if (error || !file || file.storage_provider !== "google_drive" || !file.provider_file_id) throw new AccountApiError("没有权限访问该 Google Drive 附件。", 403);
    const upstream = await getGoogleDriveContent(file.provider_file_id, request.headers.get("range"));
    await writeAuditLog(context, {
      actionType: body.action === "download" ? "download_attachment" : "view_attachment",
      moduleKey: "attachments", entityType: config.table, entityId: file.id,
      description: `${body.action === "download" ? "下载" : "查看"} Google Drive 附件：${file.file_name}`,
      logCategory: "business"
    });
    const disposition = body.action === "download" ? "attachment" : "inline";
    const headers = new Headers({
      "Content-Type": file.file_type || upstream.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes"
    });
    for (const key of ["content-length", "content-range"]) {
      const value = upstream.headers.get(key);
      if (value) headers.set(key, value);
    }
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
