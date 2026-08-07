export type MigrationRuleTable = "property_files" | "contract_files" | "rent_payment_files" | "expense_files";

export const migrationTableSelect: Record<MigrationRuleTable, string> = {
  property_files: "id,user_id,file_name,file_type,file_size,storage_provider,provider_file_id,property_id",
  contract_files: "id,user_id,file_name,file_type,file_size,storage_provider,provider_file_id,contract_id",
  rent_payment_files: "id,user_id,file_name,file_type,file_size,storage_provider,provider_file_id,rent_payment_id",
  expense_files: "id,user_id,file_name,file_type,file_size,storage_provider,provider_file_id,expense_id"
};

function extensionFor(fileName: string, mime: string | null) {
  const existing = fileName.match(/\.([A-Za-z0-9]{1,12})$/)?.[1]?.toLowerCase();
  if (existing) return existing;
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  return "bin";
}

export function buildGoogleMigrationTargetPath(workspaceId: string, table: MigrationRuleTable, parentId: string | null, attachmentId: string, fileName: string, mime: string | null) {
  return `${workspaceId}/migrated/${table}/${parentId || "unlinked"}/${attachmentId}.${extensionFor(fileName, mime)}`;
}

export function sha256Hex(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
import { createHash } from "crypto";
