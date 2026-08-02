import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { AccountApiError } from "@/lib/server/account-auth";

export const attachmentStorageConfigs = {
  "contract-files": { table: "contract_files", parentTable: "contracts", ownerColumn: "contract_id", tenantColumn: "tenant_id" },
  "rent-payment-files": { table: "rent_payment_files", parentTable: "rent_payments", ownerColumn: "rent_payment_id" },
  "expense-files": { table: "expense_files", parentTable: "expenses", ownerColumn: "expense_id" }
} as const;

export type AttachmentStorageBucket = keyof typeof attachmentStorageConfigs;

type UploadTicketPayload = {
  version: 1;
  expiresAt: number;
  workspaceOwnerId: string;
  bucket: AttachmentStorageBucket;
  ownerId: string;
  tenantId?: string;
  contractId?: string | null;
  path: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadId: string;
};

function ticketSecret() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new AccountApiError("附件上传服务暂未配置，请联系管理员。", 503);
  return value;
}

function sign(encodedPayload: string) {
  return createHmac("sha256", ticketSecret()).update(encodedPayload).digest("base64url");
}

export function createAttachmentUploadTicket(input: Omit<UploadTicketPayload, "version" | "expiresAt" | "uploadId" | "path"> & { path?: string }) {
  const uploadId = randomUUID();
  const extension = extensionForMimeType(input.fileType);
  const scope = input.bucket === "contract-files"
    ? `${input.tenantId || input.ownerId}/${input.contractId || "tenant"}`
    : input.ownerId;
  const path = input.path || `${input.workspaceOwnerId}/attachments/${input.bucket}/${scope}/${uploadId}.${extension}`;
  const payload: UploadTicketPayload = {
    version: 1,
    expiresAt: Date.now() + 10 * 60 * 1000,
    workspaceOwnerId: input.workspaceOwnerId,
    bucket: input.bucket,
    ownerId: input.ownerId,
    path,
    fileName: input.fileName,
    fileType: input.fileType,
    fileSize: input.fileSize,
    uploadId
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { ...payload, ticket: `${encoded}.${sign(encoded)}` };
}

export function verifyAttachmentUploadTicket(ticket: string): UploadTicketPayload {
  const [encoded, signature] = ticket.split(".");
  if (!encoded || !signature) throw new AccountApiError("附件上传凭据无效，请重新上传。", 400);
  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new AccountApiError("附件上传凭据无效，请重新上传。", 400);
  }
  let payload: UploadTicketPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new AccountApiError("附件上传凭据无效，请重新上传。", 400);
  }
  if (payload.version !== 1 || !payload.expiresAt || payload.expiresAt < Date.now() || !attachmentStorageConfigs[payload.bucket]) {
    throw new AccountApiError("附件上传凭据已过期，请重新上传。", 400);
  }
  return payload;
}

function extensionForMimeType(type: string) {
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  return "jpg";
}
