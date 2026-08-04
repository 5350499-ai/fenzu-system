export const DATA_EXPORT_FORMAT = "fenzu-system-json" as const;
export const DATA_EXPORT_VERSION = 1 as const;

const SENSITIVE_EXPORT_KEY = /password|access[_-]?token|refresh[_-]?token|session|secret|service[_-]?role|api[_-]?key|authorization|cookie|private[_-]?key/i;

export type DataExportPayload = {
  format: typeof DATA_EXPORT_FORMAT;
  version: typeof DATA_EXPORT_VERSION;
  exportedAt: string;
  data: Record<string, unknown>;
};

export function stripSensitiveExportData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveExportData);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_EXPORT_KEY.test(key))
      .map(([key, nestedValue]) => [key, stripSensitiveExportData(nestedValue)])
  );
}

export function createDataExportPayload(data: Record<string, unknown>, exportedAt = new Date().toISOString()): DataExportPayload {
  return stripSensitiveExportData({ format: DATA_EXPORT_FORMAT, version: DATA_EXPORT_VERSION, exportedAt, data }) as DataExportPayload;
}

export function dataExportFileName(date = new Date()): string {
  return `分租管理数据-${date.toISOString().replace(/[:.]/g, "-")}.json`;
}

export function isDataExportPayload(value: unknown): value is DataExportPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<DataExportPayload>;
  return payload.format === DATA_EXPORT_FORMAT
    && payload.version === DATA_EXPORT_VERSION
    && typeof payload.exportedAt === "string"
    && Boolean(payload.data && typeof payload.data === "object" && !Array.isArray(payload.data));
}
