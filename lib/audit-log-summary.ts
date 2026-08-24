import type { CurrencyCode } from "./currency";

export type AuditSummaryLog = {
  amount?: number | string | null;
  before_data?: unknown;
  after_data?: unknown;
};

export type AuditPresentationLog = AuditSummaryLog & {
  action_type?: string;
  created_at?: string;
};

export type LinkedReceiptAuditPresentation = {
  title: "永久删除收款" | "作废收款";
  rentAmount: number;
  depositAmount: number;
  totalAmount: number;
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

function linkedReceiptTitle(actionType: string | undefined) {
  if (actionType === "linked_receipt_delete") return "永久删除收款" as const;
  if (actionType === "linked_receipt_void") return "作废收款" as const;
  return null;
}

export function getLinkedReceiptAuditPresentation(log: AuditPresentationLog): LinkedReceiptAuditPresentation | null {
  const title = linkedReceiptTitle(log.action_type);
  if (!title) return null;

  const rows = [objectValue(log.after_data), objectValue(log.before_data)].filter((row): row is Record<string, unknown> => Boolean(row));
  const rentAmount = firstNumber(rows, ["rentAmount", "rent_amount"]);
  const depositAmount = firstNumber(rows, ["depositAmount", "deposit_amount"]);
  const totalAmount = firstNumber(rows, ["totalAmount", "total_amount"]);

  if (rentAmount === undefined && depositAmount === undefined && totalAmount === undefined) return null;
  const rent = rentAmount ?? 0;
  const deposit = depositAmount ?? 0;
  return {
    title,
    rentAmount: rent,
    depositAmount: deposit,
    totalAmount: totalAmount ?? rent + deposit
  };
}

export function sortAuditLogsForPresentation<T extends AuditPresentationLog>(logs: T[]) {
  return logs
    .map((log, index) => ({ log, index }))
    .sort((left, right) => {
      const timeDifference = Date.parse(right.log.created_at || "") - Date.parse(left.log.created_at || "");
      if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;

      const leftPriority = linkedReceiptTitle(left.log.action_type) ? 0 : 1;
      const rightPriority = linkedReceiptTitle(right.log.action_type) ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.index - right.index;
    })
    .map(({ log }) => log);
}

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
