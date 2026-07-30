export type AttachmentArchiveManifestItem = {
  recordLabel: string;
  room: string;
  moveOutDate: string | null;
  category: "contracts" | "rent-payments";
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string | null;
  checksum?: string | null;
};

export type AttachmentArchiveTask = {
  id: string;
  status: "preview" | "queued" | "running" | "completed" | "failed" | "expired";
  thresholdMonths: 3 | 6 | null;
  createdAt: string;
};

export const ATTACHMENT_ARCHIVE_ENABLED = false;

function csvCell(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/** Metadata only: the future executor calculates checksums after reading private objects. */
export function buildAttachmentArchiveManifest(items: AttachmentArchiveManifestItem[], exportedAt: string) {
  const headers = ["record", "room", "actual_move_out_date", "category", "file_name", "mime", "file_size", "uploaded_at", "exported_at", "checksum"];
  const rows = items.map((item) => [
    item.recordLabel,
    item.room,
    item.moveOutDate,
    item.category,
    item.fileName,
    item.mimeType,
    Math.max(0, Number(item.fileSize) || 0),
    item.uploadedAt,
    exportedAt,
    item.checksum || "not-generated"
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
