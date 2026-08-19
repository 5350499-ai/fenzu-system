export const DEFAULT_ACCOUNT_DISPLAY_NAME = "用户";
export const MAX_ACCOUNT_DISPLAY_NAME_LENGTH = 80;

export function normalizeSelfDisplayNameUpdate(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_SELF_PROFILE_UPDATE");
  }

  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "displayName" || typeof body.displayName !== "string") {
    throw new Error("INVALID_SELF_PROFILE_UPDATE");
  }

  const displayName = body.displayName.trim();
  if (!displayName) throw new Error("DISPLAY_NAME_REQUIRED");
  if (displayName.length > MAX_ACCOUNT_DISPLAY_NAME_LENGTH) throw new Error("DISPLAY_NAME_TOO_LONG");

  return { displayName };
}
