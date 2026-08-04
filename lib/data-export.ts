export const DATA_EXPORT_FORMAT = "fenzu-system-json" as const;
export const BACKUP_FORMAT_VERSION = 1 as const;
export const DATA_EXPORT_VERSION = BACKUP_FORMAT_VERSION;
export const APP_VERSION = "0.1.0" as const;
export const SCHEMA_VERSION = "20260804150000" as const;

const DESCRIPTION = "分租房管理系统官方备份文件，仅支持官方恢复功能，请勿手工修改。";
const SENSITIVE_EXPORT_KEY = /password|password_hash|access[_-]?token|refresh[_-]?token|session|secret|service[_-]?role|api[_-]?key|authorization|cookie|private[_-]?key/i;
const REQUIRED_COLLECTIONS = [
  "properties", "rooms", "tenants", "contracts", "rentPayments", "expenses", "deposits",
  "viewingAppointments", "tasks", "partners", "partnerShares", "partnerNameHistory",
  "propertyHistory", "settlementBatches", "settlementSnapshots", "settings"
] as const;

export type BackupSummary = {
  propertiesCount: number;
  roomsCount: number;
  tenantsCount: number;
  contractsCount: number;
  rentPaymentsCount: number;
  expensesCount: number;
  depositsCount: number;
  appointmentsCount: number;
  todosCount: number;
  partnersCount: number;
  settlementsCount: number;
  settlementSnapshotsCount: number;
};

export type DataExportPayload = {
  format: typeof DATA_EXPORT_FORMAT;
  version: typeof DATA_EXPORT_VERSION;
  description: string;
  backupFormatVersion: typeof BACKUP_FORMAT_VERSION;
  appVersion: string;
  schemaVersion: string;
  backupId: string;
  backupType: "local" | "cloud";
  exportedAt: string;
  exportedBy: string | null;
  timezone: string;
  checksum: string;
  summary: BackupSummary;
  data: Record<string, unknown>;
};

export type BackupIntegrityResult = { valid: boolean; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function stripSensitiveExportData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveExportData);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_EXPORT_KEY.test(key))
      .map(([key, nestedValue]) => [key, stripSensitiveExportData(nestedValue)])
  );
}

function count(data: Record<string, unknown>, key: string): number {
  return Array.isArray(data[key]) ? data[key].length : 0;
}

export function buildBackupSummary(data: Record<string, unknown>): BackupSummary {
  return {
    propertiesCount: count(data, "properties"),
    roomsCount: count(data, "rooms"),
    tenantsCount: count(data, "tenants"),
    contractsCount: count(data, "contracts"),
    rentPaymentsCount: count(data, "rentPayments"),
    expensesCount: count(data, "expenses"),
    depositsCount: count(data, "deposits"),
    appointmentsCount: count(data, "viewingAppointments"),
    todosCount: count(data, "tasks"),
    partnersCount: count(data, "partners"),
    settlementsCount: count(data, "settlementBatches"),
    settlementSnapshotsCount: count(data, "settlementSnapshots")
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

async function sha256(value: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) throw new Error("当前环境不支持备份校验。");
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function checksumInput(payload: Omit<DataExportPayload, "checksum">): string {
  return canonicalJson({ ...payload, checksum: "" });
}

export async function createDataExportPayload(
  data: Record<string, unknown>,
  exportedAt = new Date().toISOString(),
  options: { backupType?: "local" | "cloud"; exportedBy?: string | null; timezone?: string } = {}
): Promise<DataExportPayload> {
  const cleanData = stripSensitiveExportData(data) as Record<string, unknown>;
  const payloadWithoutChecksum = {
    format: DATA_EXPORT_FORMAT,
    version: DATA_EXPORT_VERSION,
    description: DESCRIPTION,
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    backupId: crypto.randomUUID(),
    backupType: options.backupType || "local",
    exportedAt,
    exportedBy: options.exportedBy || null,
    timezone: options.timezone || "UTC",
    summary: buildBackupSummary(cleanData),
    data: cleanData
  } satisfies Omit<DataExportPayload, "checksum">;
  return { ...payloadWithoutChecksum, checksum: await sha256(checksumInput(payloadWithoutChecksum)) };
}

export async function verifyDataExportChecksum(payload: DataExportPayload): Promise<boolean> {
  const { checksum, ...withoutChecksum } = payload;
  return Boolean(checksum) && checksum === await sha256(checksumInput(withoutChecksum));
}

function records(data: Record<string, unknown>, key: string): Record<string, unknown>[] {
  return Array.isArray(data[key]) ? data[key].filter(isRecord) : [];
}

function addMissingReferenceErrors(errors: string[], data: Record<string, unknown>, collection: string, field: string, target: string) {
  const ids = new Set(records(data, target).map((row) => row.id).filter((id): id is string => typeof id === "string"));
  for (const row of records(data, collection)) {
    const reference = row[field];
    if (typeof reference === "string" && reference && !ids.has(reference)) errors.push(`${collection}.${field} 指向不存在的 ${target}：${reference}`);
  }
}

export function validateDataExportIntegrity(payload: DataExportPayload): BackupIntegrityResult {
  const errors: string[] = [];
  if (!isDataExportPayload(payload)) errors.push("备份元信息不完整或格式不受支持。");
  const data = payload.data;
  for (const key of REQUIRED_COLLECTIONS) if (!(key in data)) errors.push(`缺少业务模块：${key}`);
  for (const key of REQUIRED_COLLECTIONS) {
    if (!Array.isArray(data[key]) && key !== "settings") errors.push(`业务模块格式错误：${key}`);
    const ids = new Set<string>();
    for (const row of records(data, key)) {
      if (typeof row.id !== "string" || !row.id) continue;
      if (ids.has(row.id)) errors.push(`${key} 存在重复主键：${row.id}`);
      ids.add(row.id);
    }
  }
  addMissingReferenceErrors(errors, data, "rooms", "propertyId", "properties");
  addMissingReferenceErrors(errors, data, "tenants", "propertyId", "properties");
  addMissingReferenceErrors(errors, data, "tenants", "roomId", "rooms");
  addMissingReferenceErrors(errors, data, "contracts", "propertyId", "properties");
  addMissingReferenceErrors(errors, data, "contracts", "roomId", "rooms");
  addMissingReferenceErrors(errors, data, "contracts", "tenantId", "tenants");
  addMissingReferenceErrors(errors, data, "rentPayments", "propertyId", "properties");
  addMissingReferenceErrors(errors, data, "rentPayments", "roomId", "rooms");
  addMissingReferenceErrors(errors, data, "rentPayments", "tenantId", "tenants");
  addMissingReferenceErrors(errors, data, "expenses", "propertyId", "properties");
  addMissingReferenceErrors(errors, data, "expenses", "roomId", "rooms");
  addMissingReferenceErrors(errors, data, "deposits", "propertyId", "properties");
  addMissingReferenceErrors(errors, data, "deposits", "roomId", "rooms");
  addMissingReferenceErrors(errors, data, "deposits", "tenantId", "tenants");
  addMissingReferenceErrors(errors, data, "viewingAppointments", "propertyId", "properties");
  addMissingReferenceErrors(errors, data, "viewingAppointments", "roomId", "rooms");
  addMissingReferenceErrors(errors, data, "partnerShares", "partnerId", "partners");
  addMissingReferenceErrors(errors, data, "partnerShares", "propertyId", "properties");
  addMissingReferenceErrors(errors, data, "partnerNameHistory", "partnerId", "partners");
  addMissingReferenceErrors(errors, data, "settlementBatches", "propertyId", "properties");
  const summary = buildBackupSummary(data);
  for (const [key, value] of Object.entries(summary)) {
    const collection = key.replace(/Count$/, "");
    const actual = key === "appointmentsCount" ? count(data, "viewingAppointments")
      : key === "todosCount" ? count(data, "tasks")
        : key === "settlementsCount" ? count(data, "settlementBatches")
          : key === "settlementSnapshotsCount" ? count(data, "settlementSnapshots") : count(data, collection);
    if (value !== actual) errors.push(`Summary 数量不一致：${key}`);
  }
  return { valid: errors.length === 0, errors };
}

export function dataExportFileName(date = new Date()): string {
  const utcSeconds = date.toISOString().replace(/\.\d{3}Z$/, "").replace(/:/g, "-");
  return `分租管理数据-${utcSeconds}.json`;
}

export function isDataExportPayload(value: unknown): value is DataExportPayload {
  if (!isRecord(value)) return false;
  const payload = value as Partial<DataExportPayload>;
  return payload.format === DATA_EXPORT_FORMAT
    && payload.version === DATA_EXPORT_VERSION
    && payload.backupFormatVersion === BACKUP_FORMAT_VERSION
    && typeof payload.description === "string"
    && typeof payload.appVersion === "string"
    && typeof payload.schemaVersion === "string"
    && typeof payload.backupId === "string"
    && (payload.backupType === "local" || payload.backupType === "cloud")
    && typeof payload.exportedAt === "string"
    && (typeof payload.exportedBy === "string" || payload.exportedBy === null)
    && typeof payload.timezone === "string"
    && typeof payload.checksum === "string"
    && isRecord(payload.summary)
    && isRecord(payload.data);
}

type ExportTableRow = Array<string | number | boolean>;

function exportCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function exportSections(data: Record<string, unknown>): Array<{ title: string; rows: ExportTableRow[] }> {
  return Object.entries(data).map(([title, value]) => {
    if (Array.isArray(value)) {
      const records = value.filter((item): item is Record<string, unknown> => isRecord(item));
      const keys = Array.from(new Set(records.flatMap((item) => Object.keys(item))));
      return { title, rows: [keys, ...records.map((item) => keys.map((key) => exportCell(item[key])))] };
    }
    if (value && typeof value === "object") return { title, rows: [["key", "value"], ...Object.entries(value).map(([key, nested]) => [key, exportCell(nested)])] };
    return { title, rows: [["value"], [exportCell(value)]] };
  });
}

export function buildCsvDataExport(data: Record<string, unknown>): string {
  return exportSections(data).map(({ title, rows }) => [[title], ...rows].map((row) => row.map((cell) => `"${exportCell(cell).replace(/"/g, '""')}"`).join(",")).join("\n")).join("\n\n");
}

function escapeExportHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character] || character));
}

export function buildExcelDataExport(data: Record<string, unknown>): string {
  const worksheets = exportSections(data).map(({ title, rows }) => `<h2>${escapeExportHtml(title)}</h2><table border="1"><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeExportHtml(exportCell(cell))}</td>`).join("")}</tr>`).join("")}</tbody></table>`).join("<br />");
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body>${worksheets}</body></html>`;
}
