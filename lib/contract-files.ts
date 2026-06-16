"use client";

import {
  contractFileConfig,
  deleteStoredFile,
  downloadStoredFile,
  formatFileSize,
  loadStoredFiles,
  openStoredFile,
  StoredFile,
  uploadStoredFile
} from "./storage-files";

export type ContractFile = StoredFile & { contractId: string };

export async function loadContractFiles(contractIds?: string[]): Promise<ContractFile[]> {
  const files = await loadStoredFiles(contractFileConfig, contractIds);
  return files.map((file) => ({ ...file, contractId: file.ownerId }));
}

export async function uploadContractFile(contractId: string, file: File): Promise<ContractFile> {
  const uploaded = await uploadStoredFile(contractFileConfig, contractId, file);
  return { ...uploaded, contractId: uploaded.ownerId };
}

export const openContractFile = openStoredFile;
export const downloadContractFile = downloadStoredFile;
export const deleteContractFile = deleteStoredFile;
export { formatFileSize };
