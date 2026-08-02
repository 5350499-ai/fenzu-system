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

export type ContractFile = StoredFile & { contractId: string | null };

export async function loadContractFiles(contractIds?: string[], tenantIds?: string[]): Promise<ContractFile[]> {
  const files = await loadStoredFiles(contractFileConfig, contractIds, tenantIds);
  return files.map((file) => ({ ...file, contractId: file.ownerId }));
}

export async function uploadContractFile(tenantId: string, contractId: string | null, file: File): Promise<ContractFile> {
  const uploaded = await uploadStoredFile(contractFileConfig, contractId || tenantId, file, { tenantId, contractId });
  return { ...uploaded, contractId };
}

export const openContractFile = openStoredFile;
export const downloadContractFile = downloadStoredFile;
export const deleteContractFile = deleteStoredFile;
export { formatFileSize };
