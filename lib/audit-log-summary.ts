import type { CurrencyCode } from "./currency";

export type AuditSummaryLog = {
  amount?: number | string | null;
  before_data?: unknown;
  after_data?: unknown;
};

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstNumber(rows: Array<Record<string, unknown>>, keys: string[]) {
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key];
      if ((typeof value === "number" || (typeof value === "string" && value.trim())) && Number.isFinite(Number(value))) {
        return Number(value);
      }
    }
  }
  return undefined;
}

type CurrencyFormatter = (value: number | string | null | undefined, currency?: CurrencyCode) => string;

export function buildAuditLogSummary(log: AuditSummaryLog, currencyCode: CurrencyCode | undefined, formatAmount: CurrencyFormatter) {
  const rows = [objectValue(log.after_data), objectValue(log.before_data)].filter((row): row is Record<string, unknown> => Boolean(row));
  const rentAmount = firstNumber(rows, ["rentAmount", "rent_amount"]);
  const depositAmount = firstNumber(rows, ["depositAmount", "deposit_amount"]);
  const totalAmount = firstNumber(rows, ["totalAmount", "total_amount"]);

  if (rentAmount !== undefined || depositAmount !== undefined || totalAmount !== undefined) {
    const rent = rentAmount ?? 0;
    const deposit = depositAmount ?? 0;
    const total = totalAmount ?? rent + deposit;
    return `房租：${formatAmount(rent, currencyCode)}｜押金：${formatAmount(deposit, currencyCode)}｜合计：${formatAmount(total, currencyCode)}`;
  }

  for (const row of rows) {
    const text = [row.name, row.displayName, row.display_name, row.category, row.incomeItem, row.income_item]
      .find((value) => typeof value === "string" && value.trim());
    if (text) return String(text).slice(0, 80);
  }

  const amount = firstNumber(
    [{ amount: log.amount }, ...rows],
    ["amount", "amountPaid", "amount_paid", "amountDue", "amount_due", "monthlyRent", "monthly_rent"]
  );
  return amount === undefined ? "" : formatAmount(amount, currencyCode);
}
