export const DELETE_CONFIRMATION_TOKEN = "DELETE" as const;

export function isValidDeleteConfirmation(value: string) {
  return value.trim() === DELETE_CONFIRMATION_TOKEN;
}
