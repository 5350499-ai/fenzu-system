import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission, requireSensitivePermission } from "@/lib/server/account-auth";
import { isAllowedAttachmentType, MAX_ATTACHMENT_FILE_SIZE, MAX_ATTACHMENT_FILE_SIZE_LABEL } from "@/lib/attachment-file-limits";
import { getSupabaseAdmin, getSupabaseAuthVerifier } from "@/lib/supabase-admin";
import { attachmentStorageConfigs, AttachmentStorageBucket, createAttachmentUploadTicket } from "@/lib/server/supabase-attachment-upload";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const body = await parseJson(request) as {
      bucket?: AttachmentStorageBucket;
      ownerId?: string;
      tenantId?: string;
      contractId?: string | null;
      fileName?: string;
      fileType?: string;
      fileSize?: number;
    };
    const config = body.bucket ? attachmentStorageConfigs[body.bucket] : null;
    const isContractAttachment = body.bucket === "contract-files";
    if (!config || !body.fileName || !body.fileType || !Number.isFinite(body.fileSize) || (isContractAttachment ? !body.tenantId : !body.ownerId)) {
      throw new AccountApiError("附件上传请求无效。", 400);
    }
    if (!isAllowedAttachmentType(body.fileType) || body.fileSize! <= 0 || body.fileSize! > MAX_ATTACHMENT_FILE_SIZE) {
      throw new AccountApiError(`只支持不超过 ${MAX_ATTACHMENT_FILE_SIZE_LABEL} 的 PDF、JPG、PNG 文件。`, 400);
    }
    await requireModulePermission(context, "attachments", "create");
    await requireSensitivePermission(context, "can_upload_files");
    const verifier = getSupabaseAuthVerifier(context.accessToken);
    let contractId: string | null = isContractAttachment ? (body.contractId || null) : body.ownerId!;
    if (isContractAttachment) {
      const { data: tenant, error: tenantError } = await verifier.from("tenants").select("id").eq("id", body.tenantId!).maybeSingle();
      if (tenantError || !tenant) throw new AccountApiError("没有权限向该租客上传附件。", 403);
      if (contractId) {
        const { data: contract, error: contractError } = await verifier.from("contracts").select("id,tenant_id").eq("id", contractId).maybeSingle();
        if (contractError || !contract || contract.tenant_id !== body.tenantId) throw new AccountApiError("合同与租客不匹配，无法上传附件。", 403);
      }
    } else {
      const { data: owner, error } = await verifier.from(config.parentTable).select("id").eq("id", body.ownerId!).maybeSingle();
      if (error || !owner) throw new AccountApiError("没有权限向该业务记录上传附件。", 403);
    }
    const ownerId = contractId || body.tenantId || body.ownerId!;
    const upload = createAttachmentUploadTicket({
      workspaceOwnerId: context.profile.workspace_owner_id,
      bucket: body.bucket!,
      ownerId,
      tenantId: isContractAttachment ? body.tenantId : undefined,
      contractId: isContractAttachment ? contractId : undefined,
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
