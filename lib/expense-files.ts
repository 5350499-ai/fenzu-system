"use client";

import {
  deleteStoredFile,
  downloadStoredFile,
  expenseFileConfig,
  formatFileSize,
  loadStoredFiles,
  openStoredFile,
  StoredFile,
  uploadStoredFile
} from "./storage-files";

export type ExpenseFile = StoredFile & { expenseId: string };

export async function loadExpenseFiles(expenseIds?: string[]): Promise<ExpenseFile[]> {
  const files = await loadStoredFiles(expenseFileConfig, expenseIds);
  return files.map((file) => ({ ...file, expenseId: file.ownerId }));
}

export async function uploadExpenseFile(expenseId: string, file: File): Promise<ExpenseFile> {
  const uploaded = await uploadStoredFile(expenseFileConfig, expenseId, file);
  return { ...uploaded, expenseId: uploaded.ownerId };
}

export const openExpenseFile = openStoredFile;
export const downloadExpenseFile = downloadStoredFile;
export const deleteExpenseFile = deleteStoredFile;
export { formatFileSize };
