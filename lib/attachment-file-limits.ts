export const MAX_ATTACHMENT_FILE_SIZE = 4 * 1024 * 1024;
export const MAX_ATTACHMENT_FILE_SIZE_LABEL = "4MB";
export const ALLOWED_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export function isAllowedAttachmentType(value: string) {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(value);
}
