import { NextResponse } from "next/server";
import {
  AccountApiError,
  apiErrorResponse,
  parseJson,
  requireActiveAccount,
  requireModulePermission,
  requirePropertyAccess,
  requireSensitivePermission
} from "@/lib/server/account-auth";
import { trashGoogleDriveFile } from "@/lib/server/google-drive";
import { getSupabaseAdmin, getSupabaseAuthVerifier } from "@/lib/supabase-admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LifecycleAction = "void" | "delete";
type PaymentFileRow = {
  storage_provider: "supabase" | "google_drive";
  provider_file_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
};

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const body = await parseJson(request) as { paymentId?: string; action?: LifecycleAction };
    if (!body.paymentId || !uuidPattern.test(body.paymentId) || !body.action || !["void", "delete"].includes(body.action)) {
      throw new AccountApiError("收款生命周期请求无效。", 400, "invalid_rent_payment_lifecycle");
    }

    const permission = body.action === "void" ? "archive" : "delete";
    await requireModulePermission(context, "rent_payments", permission);
    const verifier = getSupabaseAuthVerifier(context.accessToken);
    const { data: payment, error: paymentError } = await verifier
      .from("rent_payments")
      .select("id,property_id")
      .eq("id", body.paymentId)
      .maybeSingle();
    if (paymentError || !payment) throw new AccountApiError("收款记录不存在或无权访问。", 404, "rent_payment_not_found");
    await requirePropertyAccess(context, payment.property_id);

    let paymentFiles: PaymentFileRow[] = [];
    if (body.action === "delete") {
      const { data, error } = await getSupabaseAdmin()
        .from("rent_payment_files")
        .select("storage_provider,provider_file_id,storage_bucket,storage_path")
        .eq("user_id", context.profile.workspace_owner_id)
        .eq("rent_payment_id", body.paymentId);
      if (error) throw new AccountApiError("无法确认收款附件状态，请稍后重试。", 500, "rent_payment_files_unavailable");
      paymentFiles = (data || []) as PaymentFileRow[];
      if (paymentFiles.length) {
        await requireModulePermission(context, "attachments", "delete");
        await requireSensitivePermission(context, "can_delete_files");
      }
    }

    const rpcName = body.action === "void"
      ? "void_rent_payment_with_linked_deposit"
      : "permanently_delete_rent_payment_with_linked_deposit";
    const { data: result, error } = await verifier.rpc(rpcName, { p_payment_id: body.paymentId });
    if (error) {
      if (error.code === "42501") throw new AccountApiError("没有权限执行此操作。", 403, "rent_payment_lifecycle_forbidden");
      if (error.code === "P0002") throw new AccountApiError("收款记录不存在，可能已被删除。", 404, "rent_payment_not_found");
      if (error.code === "21000") throw new AccountApiError("检测到多条押金关联，本次操作已停止，数据未修改。", 409, "ambiguous_linked_deposit");
      if (error.code === "22023") throw new AccountApiError("押金关联状态不一致，本次操作已停止，数据未修改。", 409, "invalid_linked_deposit");
      if (error.code === "23503") throw new AccountApiError("关联记录仍被其他业务使用，本次操作已回滚。", 409, "linked_receipt_reference_conflict");
      console.error("[rent-payment-lifecycle] atomic RPC failed", { requestId: context.requestId, action: body.action, code: error.code || "unknown" });
      throw new AccountApiError("操作未完成，数据库事务已回滚，请刷新后重试。", 409, "rent_payment_lifecycle_rollback");
    }

    let attachmentCleanupWarning = "";
    if (body.action === "delete" && paymentFiles.length) {
      let failedCleanupCount = 0;
      for (const file of paymentFiles) {
        try {
          if (file.storage_provider === "google_drive") {
            if (!file.provider_file_id) throw new Error("missing Google Drive file id");
            await trashGoogleDriveFile(file.provider_file_id);
            continue;
          }
          if (!file.storage_bucket || !file.storage_path) throw new Error("missing Supabase storage path");
          const { error: storageError } = await getSupabaseAdmin().storage.from(file.storage_bucket).remove([file.storage_path]);
          if (storageError) throw storageError;
        } catch {
          failedCleanupCount += 1;
        }
      }
      if (failedCleanupCount > 0) {
        attachmentCleanupWarning = "收款与关联押金已删除，但部分外部附件清理未完成，请联系管理员处理。";
        console.warn("[rent-payment-lifecycle] attachment cleanup incomplete", { requestId: context.requestId, failedCount: failedCleanupCount });
      }
    }

    return NextResponse.json({ ok: true, result, ...(attachmentCleanupWarning ? { attachmentCleanupWarning } : {}) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
