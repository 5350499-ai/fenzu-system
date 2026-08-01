export type MigrationRuleTable = "contract_files" | "rent_payment_files" | "expense_files";

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
