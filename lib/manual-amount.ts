export function isValidManualAmount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function manualAmountError() {
  return "金额必须大于 0";
}
