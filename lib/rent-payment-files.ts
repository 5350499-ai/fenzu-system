"use client";

import {
  deleteStoredFile,
  downloadStoredFile,
  formatFileSize,
  loadStoredFiles,
  openStoredFile,
  rentPaymentFileConfig,
  StoredFile,
  uploadStoredFile
} from "./storage-files";

export type RentPaymentFile = StoredFile & { rentPaymentId: string };

export async function loadRentPaymentFiles(rentPaymentIds?: string[]): Promise<RentPaymentFile[]> {
  const files = await loadStoredFiles(rentPaymentFileConfig, rentPaymentIds);
  return files.map((file) => ({ ...file, rentPaymentId: file.ownerId }));
}

export async function uploadRentPaymentFile(rentPaymentId: string, file: File): Promise<RentPaymentFile> {
  const uploaded = await uploadStoredFile(rentPaymentFileConfig, rentPaymentId, file);
  return { ...uploaded, rentPaymentId: uploaded.ownerId };
}

export const openRentPaymentFile = openStoredFile;
export const downloadRentPaymentFile = downloadStoredFile;
export const deleteRentPaymentFile = deleteStoredFile;
export { formatFileSize };
