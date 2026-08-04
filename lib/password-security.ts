export function passwordValidationMessage(password: unknown, confirmation?: unknown) {
  if (typeof password !== "string" || !password.trim()) return "密码不能为空。";
  if (password.length < 8) return "密码至少需要8位。";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "密码至少包含字母和数字。";
  if (confirmation !== undefined && password !== confirmation) return "两次输入的密码不一致。";
  return "";
}

export function isInternalAuthEmail(value: unknown) {
  return typeof value === "string" && value.trim().toLowerCase().endsWith("@accounts.fenzu.invalid");
}
