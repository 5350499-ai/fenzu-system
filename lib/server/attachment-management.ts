import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadAttachmentCleanupCandidates, loadAttachmentInventory, type AttachmentTable } from "@/lib/server/attachment-cleanup";

export type AttachmentCandidate = { tenantId: string; tenantName: string; room: string; actualMoveOutDate: string | null; contractCount: number; contractBytes: number; rentPaymentCount: number; rentPaymentBytes: number; attachmentCount: number; bytes: number; skipReason: string | null };
export type AttachmentSummary = {
  generatedAt: string;
  supabase: {
    totalCount: number; totalBytes: number;
    byTable: Record<AttachmentTable, { count: number; bytes: number }>;
    byType: Record<"image" | "pdf" | "other", { count: number; bytes: number }>;
    inRent: { count: number; bytes: number }; movedOut: { count: number; bytes: number };
  };
  googleDriveCount: number;
  candidates: { over3Months: { tenantCount: number; attachmentCount: number; bytes: number; tenants: AttachmentCandidate[]; skipped: AttachmentCandidate[] }; over6Months: { tenantCount: number; attachmentCount: number; bytes: number; tenants: AttachmentCandidate[]; skipped: AttachmentCandidate[] } };
};
function bytes(value: number) { return Math.max(0, Number(value || 0)); }
function isImage(type: string) { return type.toLowerCase().startsWith("image/"); }
function isPdf(type: string) { return type.toLowerCase() === "application/pdf"; }
function emptyCandidates() { return { tenantCount: 0, attachmentCount: 0, bytes: 0, tenants: [], skipped: [] }; }

export async function loadAttachmentSummary(workspaceOwnerId: string): Promise<AttachmentSummary> {
  const items = await loadAttachmentInventory(workspaceOwnerId);
  const supabaseItems = items.filter((item) => item.provider === "supabase");
  const byTable = Object.fromEntries((["property_files", "contract_files", "rent_payment_files", "expense_files"] as const).map((table) => {
    const rows = supabaseItems.filter((item) => item.sourceTable === table);
    return [table, { count: rows.length, bytes: rows.reduce((sum, row) => sum + bytes(row.fileSize), 0) }];
  })) as AttachmentSummary["supabase"]["byTable"];
  const byType = {
    image: { count: supabaseItems.filter((item) => isImage(item.fileType)).length, bytes: supabaseItems.filter((item) => isImage(item.fileType)).reduce((sum, item) => sum + bytes(item.fileSize), 0) },
    pdf: { count: supabaseItems.filter((item) => isPdf(item.fileType)).length, bytes: supabaseItems.filter((item) => isPdf(item.fileType)).reduce((sum, item) => sum + bytes(item.fileSize), 0) },
    other: { count: supabaseItems.filter((item) => !isImage(item.fileType) && !isPdf(item.fileType)).length, bytes: supabaseItems.filter((item) => !isImage(item.fileType) && !isPdf(item.fileType)).reduce((sum, item) => sum + bytes(item.fileSize), 0) }
  };
  const candidates = await loadAttachmentCleanupCandidates(workspaceOwnerId);
  const candidateData = { tenantCount: candidates.length, attachmentCount: candidates.reduce((sum, item) => sum + item.attachmentCount, 0), bytes: candidates.reduce((sum, item) => sum + bytes(item.bytes), 0), tenants: candidates.map((item) => ({ tenantId: item.tenantId, tenantName: item.tenantName, room: `${item.propertyName} ${item.roomName}`, actualMoveOutDate: item.actualMoveOutDate, contractCount: item.attachmentCount, contractBytes: item.bytes, rentPaymentCount: 0, rentPaymentBytes: 0, attachmentCount: item.attachmentCount, bytes: item.bytes, skipReason: null })), skipped: [] };
  return {
    generatedAt: new Date().toISOString(),
    supabase: { totalCount: supabaseItems.length, totalBytes: supabaseItems.reduce((sum, item) => sum + bytes(item.fileSize), 0), byTable, byType, inRent: { count: 0, bytes: 0 }, movedOut: { count: candidateData.attachmentCount, bytes: candidateData.bytes } },
    googleDriveCount: items.filter((item) => item.provider === "google_drive").length,
    candidates: { over3Months: candidateData, over6Months: candidateData }
  };
}
