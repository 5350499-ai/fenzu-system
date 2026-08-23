export function validDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function isValidSettlementRange(startDate: string | null | undefined, endDate: string | null | undefined) {
  return validDate(startDate) && validDate(endDate) && startDate <= endDate;
}
