export const SETTLEMENT_BUSINESS_TIME_ZONE = "Europe/Madrid";

type CalendarDateParts = { year: number; month: number; day: number };

function calendarDateParts(value: Date): CalendarDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SETTLEMENT_BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value || 0);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function formatCalendarDate(value: CalendarDateParts) {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

export function getSettlementBusinessToday(now = new Date()) {
  return formatCalendarDate(calendarDateParts(now));
}

export function getMaxSettlementEndDate(now = new Date()) {
  const today = calendarDateParts(now);
  const yesterday = new Date(Date.UTC(today.year, today.month - 1, today.day - 1));
  return formatCalendarDate({ year: yesterday.getUTCFullYear(), month: yesterday.getUTCMonth() + 1, day: yesterday.getUTCDate() });
}

export function validDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function getSettlementDateValidationError(startDate: string | null | undefined, endDate: string | null | undefined, now = new Date()) {
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) return "invalid_range" as const;
  if (endDate > getMaxSettlementEndDate(now)) return "future_end" as const;
  return null;
}

export function isValidSettlementRange(startDate: string | null | undefined, endDate: string | null | undefined, now = new Date()) {
  return getSettlementDateValidationError(startDate, endDate, now) === null;
}
