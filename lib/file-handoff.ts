"use client";

import { downloadFile } from "@/lib/download-adapter";

export type FileHandoffMethod = "share" | "file-system" | "download";

export class UserCancelledFileHandoffError extends Error {
  constructor() {
    super("用户取消保存");
    this.name = "UserCancelledFileHandoffError";
  }
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<{
  createWritable: () => Promise<{
    write: (value: File) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function saveFileWithSystemFallback(file: File): Promise<{ method: FileHandoffMethod }> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ files: [file] });
      return { method: "share" };
    } catch (error) {
      if (isAbortError(error)) throw new UserCancelledFileHandoffError();
    }
  }

  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: file.name,
        types: [{ description: "JSON 备份文件", accept: { "application/json": [".json"] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      return { method: "file-system" };
    } catch (error) {
      if (isAbortError(error)) throw new UserCancelledFileHandoffError();
    }
  }

  await downloadFile(file, { preferShare: false });
  return { method: "download" };
}
