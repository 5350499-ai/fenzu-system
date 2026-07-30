export type CandidateTenantInput = {
  status: string | null;
  actualMoveOutDate: string | null;
  hasActiveContract: boolean;
};

export type CandidateSkipReason = "invalid_move_out_date" | "missing_move_out_date" | "not_moved_out" | "active_contract" | "not_old_enough";

export function isTenantCandidateAttachmentTable(table: string) {
  return table === "contract_files" || table === "rent_payment_files";
}

export function isContractCurrentlyActive(input: { status: string | null; isActive: boolean | null; endDate: string | null }, today: string) {
  if (input.isActive === false) return false;
  const status = (input.status || "").toLowerCase();
  if (["已结束", "已归档", "已退租", "已作废", "作废", "ended", "archived", "void"].some((value) => status.includes(value.toLowerCase()))) return false;
  return !input.endDate || (isCalendarDate(input.endDate) && input.endDate >= today);
}

export function isCalendarDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function localCalendarDate(value: Date, timeZone = "Europe/Madrid") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function calendarCutoffDate(today: Date, months: number, timeZone = "Europe/Madrid") {
  if (!Number.isInteger(months) || months < 0) throw new Error("months must be a non-negative integer");
  const local = localCalendarDate(today, timeZone);
  if (!local) throw new Error("Unable to determine local calendar date");
  const [year, month, day] = local.split("-").map(Number);
  const targetMonth = month - 1 - months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const cutoff = new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay)));
  return cutoff.toISOString().slice(0, 10);
}

export function evaluateCandidate(input: CandidateTenantInput, cutoffDate: string): { eligible: true } | { eligible: false; reason: CandidateSkipReason } {
  if (!isCalendarDate(input.actualMoveOutDate)) return { eligible: false, reason: input.actualMoveOutDate ? "invalid_move_out_date" : "missing_move_out_date" };
  if (input.status !== "已退租") return { eligible: false, reason: "not_moved_out" };
  if (input.hasActiveContract) return { eligible: false, reason: "active_contract" };
  if (input.actualMoveOutDate > cutoffDate) return { eligible: false, reason: "not_old_enough" };
  return { eligible: true };
}
