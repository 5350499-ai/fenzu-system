export const DATA_EXPORT_FORMAT = "fenzu-system-json" as const;
export const BACKUP_FORMAT_VERSION = 1 as const;
export const DATA_EXPORT_VERSION = BACKUP_FORMAT_VERSION;
export const APP_VERSION = "0.1.0" as const;
export const SCHEMA_VERSION = "20260804150000" as const;
export const GENERATED_BY = "Fenzu System" as const;
export const SOFTWARE_EDITION = "Community" as const;
export const APPLICATION_NAME = "咱家分租" as const;
export const APPLICATION_ID = "zanjia-rental" as const;

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
  totalRecords: number;
  backupSizeBytes: number;
  backupSizeHuman: string;
};

export type BackupMetadata = {
  backupFormatVersion: typeof BACKUP_FORMAT_VERSION;
  appVersion: string;
  schemaVersion: string;
  backupId: string;
  backupType: "local" | "cloud";
  exportedAt: string;
  exportedBy: string | null;
  timezone: string;
  checksum: string;
  description: string;
  generatedBy: typeof GENERATED_BY;
  softwareEdition: typeof SOFTWARE_EDITION;
  platform: "Web" | "iOS" | "Android" | "Windows" | "macOS";
  exportReason: "Manual" | "AutoCloud" | "BeforeRestore" | "BeforeUpgrade";
  exportDurationMs: number;
  recordCount: number;
  applicationName: typeof APPLICATION_NAME;
  applicationId: typeof APPLICATION_ID;
};

export type DataExportPayload = {
  metadata: BackupMetadata;
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

function normalizeNullableUuidReferences(data: Record<string, unknown>): Record<string, unknown> {
  const isUuidReferenceKey = (key: string) => key !== "id" && (key.endsWith("Id") || key.endsWith("_id"));
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
      if (isUuidReferenceKey(key) && (nested === "" || nested === "null" || nested === "undefined")) return [key, null];
      return [key, normalize(nested)];
    }));
  };
  return normalize(data) as Record<string, unknown>;
}

export function buildBackupSummary(data: Record<string, unknown>, backupSizeBytes = 0): BackupSummary {
  const summary = {
    propertiesCount: count(data, "properties"), roomsCount: count(data, "rooms"), tenantsCount: count(data, "tenants"),
    contractsCount: count(data, "contracts"), rentPaymentsCount: count(data, "rentPayments"), expensesCount: count(data, "expenses"),
    depositsCount: count(data, "deposits"), appointmentsCount: count(data, "viewingAppointments"), todosCount: count(data, "tasks"),
    partnersCount: count(data, "partners"), settlementsCount: count(data, "settlementBatches"), settlementSnapshotsCount: count(data, "settlementSnapshots"),
    totalRecords: 0, backupSizeBytes, backupSizeHuman: formatBackupSize(backupSizeBytes)
  } satisfies BackupSummary;
  summary.totalRecords = Object.entries(data).reduce((total, [, value]) => total + (Array.isArray(value) ? value.length : 0), 0);
  return summary;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function formatBackupSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function sha256(value: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) throw new Error("当前环境不支持备份校验。");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function checksumInput(payload: DataExportPayload): string {
  return canonicalJson({ ...payload, metadata: { ...payload.metadata, checksum: "" } });
}

function jsonForSize(payload: DataExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

function normalizedMetadata(options: { backupType?: "local" | "cloud"; exportedBy?: string | null; timezone?: string; platform?: BackupMetadata["platform"]; exportReason?: BackupMetadata["exportReason"] }, exportedAt: string): Omit<BackupMetadata, "checksum"> {
  return {
    backupFormatVersion: BACKUP_FORMAT_VERSION, appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION,
    backupId: crypto.randomUUID(), backupType: options.backupType || "local", exportedAt,
    exportedBy: options.exportedBy || null, timezone: options.timezone || "UTC", description: DESCRIPTION,
    generatedBy: GENERATED_BY, softwareEdition: SOFTWARE_EDITION, platform: options.platform || "Web",
    exportReason: options.exportReason || "Manual", exportDurationMs: 0, recordCount: 0,
    applicationName: APPLICATION_NAME, applicationId: APPLICATION_ID
  };
}

export async function createDataExportPayload(
  data: Record<string, unknown>,
  exportedAt = new Date().toISOString(),
  options: { backupType?: "local" | "cloud"; exportedBy?: string | null; timezone?: string; platform?: BackupMetadata["platform"]; exportReason?: BackupMetadata["exportReason"] } = {}
): Promise<DataExportPayload> {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const cleanData = normalizeNullableUuidReferences(stripSensitiveExportData(data) as Record<string, unknown>);
  const metadata = normalizedMetadata(options, exportedAt);
  const recordCount = buildBackupSummary(cleanData).totalRecords;
  const elapsed = () => Math.max(0, Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt));
  let payload: DataExportPayload = { metadata: { ...metadata, checksum: "0".repeat(64), recordCount }, summary: buildBackupSummary(cleanData), data: cleanData };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const backupSizeBytes = utf8Bytes(jsonForSize(payload));
    payload = { ...payload, summary: buildBackupSummary(cleanData, backupSizeBytes) };
    payload = { ...payload, summary: { ...payload.summary, backupSizeHuman: formatBackupSize(backupSizeBytes) } };
    payload = { ...payload, metadata: { ...payload.metadata, exportDurationMs: elapsed() } };
    payload = { ...payload, metadata: { ...payload.metadata, checksum: await sha256(checksumInput(payload)) } };
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const finalSizeBytes = utf8Bytes(jsonForSize(payload));
    payload = { ...payload, summary: { ...payload.summary, backupSizeBytes: finalSizeBytes, backupSizeHuman: formatBackupSize(finalSizeBytes) } };
    payload = { ...payload, metadata: { ...payload.metadata, exportDurationMs: elapsed() } };
    payload = { ...payload, metadata: { ...payload.metadata, checksum: await sha256(checksumInput(payload)) } };
  }
  return payload;
}

export async function verifyDataExportChecksum(payload: DataExportPayload): Promise<boolean> {
  return Boolean(payload.metadata?.checksum) && payload.metadata.checksum === await sha256(checksumInput(payload));
}

export function dataExportFileName(date = new Date()): string {
  const part = (value: number) => String(value).padStart(2, "0");
  return `zanjia-rental-backup-${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}-${part(date.getHours())}-${part(date.getMinutes())}.json`;
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
  const expected = buildBackupSummary(data);
  if (!isRecord(payload.summary)) errors.push("Summary 格式错误。");
  else for (const key of Object.keys(expected) as Array<keyof BackupSummary>) {
    if (key !== "backupSizeBytes" && key !== "backupSizeHuman" && payload.summary[key] !== expected[key]) errors.push(`Summary 数量不一致：${key}`);
  }
  const actualSizeBytes = utf8Bytes(jsonForSize(payload));
  if (payload.summary.backupSizeBytes !== actualSizeBytes) errors.push("Summary 文件大小不一致：backupSizeBytes");
  if (payload.summary.backupSizeHuman !== formatBackupSize(actualSizeBytes)) errors.push("Summary 文件大小不一致：backupSizeHuman");
  if (payload.metadata.recordCount !== expected.totalRecords || payload.metadata.recordCount !== payload.summary.totalRecords) errors.push("Metadata 数据条数不一致：recordCount");
  return { valid: errors.length === 0, errors };
}

export function isDataExportPayload(value: unknown): value is DataExportPayload {
  if (!isRecord(value) || !isRecord(value.metadata) || !isRecord(value.summary) || !isRecord(value.data)) return false;
  const metadata = value.metadata as Partial<BackupMetadata>;
  return metadata.backupFormatVersion === BACKUP_FORMAT_VERSION && typeof metadata.appVersion === "string"
    && typeof metadata.schemaVersion === "string" && typeof metadata.backupId === "string"
    && (metadata.backupType === "local" || metadata.backupType === "cloud") && typeof metadata.exportedAt === "string"
    && (typeof metadata.exportedBy === "string" || metadata.exportedBy === null) && typeof metadata.timezone === "string"
    && typeof metadata.checksum === "string" && metadata.generatedBy === GENERATED_BY
    && metadata.softwareEdition === SOFTWARE_EDITION && typeof metadata.description === "string"
    && typeof metadata.platform === "string" && typeof metadata.exportReason === "string"
    && typeof metadata.exportDurationMs === "number" && Number.isFinite(metadata.exportDurationMs)
    && typeof metadata.recordCount === "number" && Number.isInteger(metadata.recordCount)
    && metadata.applicationName === APPLICATION_NAME && metadata.applicationId === APPLICATION_ID;
}

export async function dryRunRestore(payload: unknown): Promise<BackupIntegrityResult> {
  if (!isDataExportPayload(payload)) return { valid: false, errors: ["此备份文件与当前软件版本不兼容，暂时无法恢复。"] };
  if (payload.metadata.backupFormatVersion !== BACKUP_FORMAT_VERSION || payload.metadata.schemaVersion !== SCHEMA_VERSION) return { valid: false, errors: ["此备份文件与当前软件版本不兼容，暂时无法恢复。"] };
  const integrity = validateDataExportIntegrity(payload);
  if (!integrity.valid) return integrity;
  if (!await verifyDataExportChecksum(payload)) return { valid: false, errors: ["备份校验失败，请重新生成备份。"] };
  return { valid: true, errors: [] };
}

type ExportTableRow = Array<string | number | boolean>;
function exportCell(value: unknown): string { if (value == null) return ""; if (typeof value === "object") return JSON.stringify(value); return String(value); }
function exportSections(data: Record<string, unknown>): Array<{ title: string; rows: ExportTableRow[] }> {
  return Object.entries(data).map(([title, value]) => {
    if (Array.isArray(value)) { const rows = value.filter(isRecord); const keys = Array.from(new Set(rows.flatMap((item) => Object.keys(item)))); return { title, rows: [keys, ...rows.map((item) => keys.map((key) => exportCell(item[key])))] }; }
    if (value && typeof value === "object") return { title, rows: [["key", "value"], ...Object.entries(value).map(([key, nested]) => [key, exportCell(nested)])] };
    return { title, rows: [["value"], [exportCell(value)]] };
  });
}
export function buildCsvDataExport(data: Record<string, unknown>): string { return exportSections(data).map(({ title, rows }) => [[title], ...rows].map((row) => row.map((cell) => `"${exportCell(cell).replace(/"/g, '""')}"`).join(",")).join("\n")).join("\n\n"); }
function escapeExportHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character] || character)); }
export function buildExcelDataExport(data: Record<string, unknown>): string { const worksheets = exportSections(data).map(({ title, rows }) => `<h2>${escapeExportHtml(title)}</h2><table border="1"><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeExportHtml(exportCell(cell))}</td>`).join("")}</tr>`).join("")}</tbody></table>`).join("<br />"); return `<!doctype html><html><head><meta charset="utf-8" /></head><body>${worksheets}</body></html>`; }
