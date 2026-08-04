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

type ExportTableRow = Array<string | number | boolean>;

function exportCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function exportSections(data: Record<string, unknown>): Array<{ title: string; rows: ExportTableRow[] }> {
  return Object.entries(data).map(([title, value]) => {
    if (Array.isArray(value)) {
      const records = value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
      const keys = Array.from(new Set(records.flatMap((item) => Object.keys(item))));
      return { title, rows: [keys, ...records.map((item) => keys.map((key) => exportCell(item[key])))] };
    }
    if (value && typeof value === "object") {
      return { title, rows: [["key", "value"], ...Object.entries(value).map(([key, nested]) => [key, exportCell(nested)])] };
    }
    return { title, rows: [["value"], [exportCell(value)]] };
  });
}

export function buildCsvDataExport(data: Record<string, unknown>): string {
  return exportSections(data).map(({ title, rows }) => [
    [title],
    ...rows
  ].map((row) => row.map((cell) => `"${exportCell(cell).replace(/"/g, '""')}"`).join(",")).join("\n")).join("\n\n");
}

function escapeExportHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character] || character));
}

export function buildExcelDataExport(data: Record<string, unknown>): string {
  const worksheets = exportSections(data).map(({ title, rows }) => `<h2>${escapeExportHtml(title)}</h2><table border="1"><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeExportHtml(exportCell(cell))}</td>`).join("")}</tr>`).join("")}</tbody></table>`).join("<br />");
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body>${worksheets}</body></html>`;
}
