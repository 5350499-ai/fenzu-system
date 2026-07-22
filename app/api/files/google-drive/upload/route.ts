import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, requireActiveAccount, requireModulePermission, requireSensitivePermission } from "@/lib/server/account-auth";
import { MAX_ATTACHMENT_FILE_SIZE } from "@/lib/attachment-file-limits";
import { getGoogleAccessToken, stampGoogleUpload, trashGoogleDriveFile } from "@/lib/server/google-drive";
import { getSupabaseAuthVerifier } from "@/lib/supabase-admin";

const configs = {
  "contract-files": { table: "contracts", sensitive: "can_upload_files" },
  "rent-payment-files": { table: "rent_payments", sensitive: "can_upload_files" },
  "expense-files": { table: "expenses", sensitive: "can_upload_files" }
} as const;

function parseGoogleUploadUrl(value: string | null) {
  if (!value) throw new AccountApiError("Google Drive 上传请求无效。", 400);
  let url: URL;
  try { url = new URL(value); } catch { throw new AccountApiError("Google Drive 上传请求无效。", 400); }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.googleapis.com" ||
    url.pathname !== "/upload/drive/v3/files" ||
    url.searchParams.get("uploadType") !== "resumable" ||
    !url.searchParams.get("upload_id")
  ) throw new AccountApiError("Google Drive 上传请求无效。", 400);
  return url;
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const bucket = request.headers.get("x-attachment-bucket") as keyof typeof configs | null;
    const ownerId = request.headers.get("x-attachment-owner-id");
    const uploadId = request.headers.get("x-attachment-upload-id");
    const fileType = request.headers.get("content-type") || "";
    const declaredSize = Number(request.headers.get("x-attachment-file-size"));
    const contentLength = Number(request.headers.get("content-length"));
    const config = bucket ? configs[bucket] : null;
    if (!config || !ownerId || !uploadId || !Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_ATTACHMENT_FILE_SIZE) {
      throw new AccountApiError("附件上传请求无效。", 400);
    }
    if (!Number.isFinite(contentLength) || contentLength !== declaredSize) throw new AccountApiError("附件大小校验失败，请重新选择文件。", 400);
    await requireModulePermission(context, "attachments", "create");
    await requireSensitivePermission(context, config.sensitive);
    const verifier = getSupabaseAuthVerifier(context.accessToken);
    const { data: owner, error } = await verifier.from(config.table).select("id").eq("id", ownerId).maybeSingle();
    if (error || !owner) throw new AccountApiError("没有权限向该业务记录上传附件。", 403);

    const uploadUrl = parseGoogleUploadUrl(request.headers.get("x-google-upload-url"));
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength !== declaredSize || bytes.byteLength > MAX_ATTACHMENT_FILE_SIZE) throw new AccountApiError("附件大小校验失败，请重新选择文件。", 400);
    const token = await getGoogleAccessToken();
    let response: Response;
    try {
      response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": fileType, "Content-Length": String(bytes.byteLength) },
        body: bytes,
        cache: "no-store"
      });
    } catch {
      throw new AccountApiError("Google Drive 上传网络连接失败，请稍后重试。", 502);
    }
    const payload = await response.json().catch(() => null) as { id?: string } | null;
    if (!response.ok || !payload?.id) throw new AccountApiError("Google Drive 上传失败，请稍后重试。", 502);
    try {
      await stampGoogleUpload({ fileId: payload.id, kind: bucket!, ownerId, uploadId });
    } catch (error) {
      try { await trashGoogleDriveFile(payload.id); } catch { /* Keep the upload marker only when Drive cannot trash it. */ }
      throw error;
    }
    return NextResponse.json({ id: payload.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
