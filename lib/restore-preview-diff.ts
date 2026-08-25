// @ts-expect-error Node's strip-types test runner requires the explicit extension.
import { getBackupRestoreDisplayLabel } from "./backup-restore-entities.ts";

export type RestorePreviewDiffRow = {
  key: string;
  label: string;
  current: number | null;
  backup: number | null;
  status: "MATCH" | "DIFFERENT" | "UNAVAILABLE" | "AUDIT_ONLY";
  differs: boolean;
};

function countValue(value: unknown) {
  if (Array.isArray(value)) return value.length;
  return value && typeof value === "object" ? 1 : 0;
}

export function buildRestorePreviewDiffRows(payloadData: Record<string, unknown>, currentData: Record<string, unknown>) {
  return Object.keys(payloadData).map<RestorePreviewDiffRow>((key) => {
    const auditOnly = key === "auditLogs";
    const hasCurrent = Object.prototype.hasOwnProperty.call(currentData, key);
    const current = hasCurrent ? countValue(currentData[key]) : null;
    const backup = countValue(payloadData[key]);
    const status = auditOnly ? "AUDIT_ONLY" : !hasCurrent ? "UNAVAILABLE" : current === backup ? "MATCH" : "DIFFERENT";
    return { key, label: getBackupRestoreDisplayLabel(key), current, backup, status, differs: status === "DIFFERENT" };
  });
}

export function summarizeRestorePreviewDiff(rows: RestorePreviewDiffRow[]) {
  return {
    differenceCount: rows.filter((row) => row.status === "DIFFERENT").length,
    unavailableCount: rows.filter((row) => row.status === "UNAVAILABLE").length,
    allMatch: rows.every((row) => row.status === "MATCH" || row.status === "AUDIT_ONLY")
  };
}
