"use client";

import {
  deleteStoredFile,
  downloadStoredFile,
  formatFileSize,
  loadStoredFiles,
  openStoredFile,
  propertyFileConfig,
  StoredFile,
  uploadStoredFile
} from "./storage-files";

export type PropertyFile = StoredFile & { propertyId: string };

export async function loadPropertyFiles(propertyIds?: string[]): Promise<PropertyFile[]> {
  const files = await loadStoredFiles(propertyFileConfig, propertyIds);
  return files.map((file) => ({ ...file, propertyId: file.ownerId }));
}

export async function uploadPropertyFile(propertyId: string, file: File): Promise<PropertyFile> {
  const uploaded = await uploadStoredFile(propertyFileConfig, propertyId, file);
  return { ...uploaded, propertyId };
}

export const openPropertyFile = openStoredFile;
export const downloadPropertyFile = downloadStoredFile;
export const deletePropertyFile = deleteStoredFile;
export { formatFileSize };
