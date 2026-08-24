import type { CurrencyCode } from "./currency";

export type AuditSummaryLog = {
  amount?: number | string | null;
  before_data?: unknown;
  after_data?: unknown;
};

export type AuditPresentationLog = AuditSummaryLog & {
  id?: string;
  action_type?: string;
  created_at?: string;
  actor_user_id?: string | null;
  entity_id?: string | null;
  room_id?: string | null;
  tenant_id?: string | null;
};

export type AuditBusinessPresentation = {
  title: string;
  rentAmount: number;
  depositAmount: number;
  totalAmount: number;
};

export type AuditDisplayGroup<T extends AuditPresentationLog> = {
  primary: T;
  technicalChildren: T[];
  presentation: AuditBusinessPresentation | null;
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

function isBusinessAggregateAction(actionType: string | undefined) {
  return Boolean(linkedReceiptTitle(actionType) || actionType === "create_check_in" || actionType === "create_tenant");
}

function receiptAmounts(log: AuditPresentationLog) {
  const rows = [objectValue(log.after_data), objectValue(log.before_data)].filter((row): row is Record<string, unknown> => Boolean(row));
  const rentAmount = firstNumber(rows, ["rentAmount", "rent_amount"]);
  const depositAmount = firstNumber(rows, ["depositAmount", "deposit_amount"]);
  const totalAmount = firstNumber(rows, ["totalAmount", "total_amount"]);

  return { rentAmount, depositAmount, totalAmount };
}

export function getAuditBusinessPresentation(log: AuditPresentationLog): AuditBusinessPresentation | null {
  const linkedTitle = linkedReceiptTitle(log.action_type);
  const { rentAmount, depositAmount, totalAmount } = receiptAmounts(log);

  if (linkedTitle) {
    if (rentAmount === undefined && depositAmount === undefined && totalAmount === undefined) return null;
    const rent = rentAmount ?? 0;
    const deposit = depositAmount ?? 0;
    return { title: linkedTitle, rentAmount: rent, depositAmount: deposit, totalAmount: totalAmount ?? rent + deposit };
  }

  const title = log.action_type === "create_check_in"
    ? "一键入住"
    : log.action_type === "create_tenant"
      ? "新增租客"
      : null;
  if (!title || (rentAmount === undefined && depositAmount === undefined && totalAmount === undefined && log.amount === undefined)) return null;

  const rent = rentAmount ?? 0;
  const deposit = depositAmount ?? 0;
  return {
    title,
    rentAmount: rent,
    depositAmount: deposit,
    totalAmount: totalAmount ?? (log.amount !== undefined && log.amount !== null && Number.isFinite(Number(log.amount)) ? Number(log.amount) : rent + deposit)
  };
}

export function getLinkedReceiptAuditPresentation(log: AuditPresentationLog) {
  return linkedReceiptTitle(log.action_type) ? getAuditBusinessPresentation(log) : null;
}

export function sortAuditLogsForPresentation<T extends AuditPresentationLog>(logs: T[]) {
  return logs
    .map((log, index) => ({ log, index }))
    .sort((left, right) => {
      const timeDifference = Date.parse(right.log.created_at || "") - Date.parse(left.log.created_at || "");
      if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;

      const leftPriority = isBusinessAggregateAction(left.log.action_type) ? 0 : 1;
      const rightPriority = isBusinessAggregateAction(right.log.action_type) ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.index - right.index;
    })
    .map(({ log }) => log);
}

function snapshotEntityIds(log: AuditPresentationLog) {
  const rows = [objectValue(log.after_data), objectValue(log.before_data)].filter((row): row is Record<string, unknown> => Boolean(row));
  const ids = new Set<string>();
  for (const row of rows) {
    for (const key of ["paymentId", "rentPaymentId", "depositId", "tenantId", "contractId", "roomId"]) {
      const value = row[key];
      if (typeof value === "string" && value) ids.add(value);
    }
  }
  for (const value of [log.entity_id, log.room_id, log.tenant_id]) {
    if (typeof value === "string" && value) ids.add(value);
  }
  return ids;
}

function isExactTechnicalChild(parent: AuditPresentationLog, child: AuditPresentationLog, entityIds: Set<string>) {
  if (!parent.created_at || parent.created_at !== child.created_at) return false;
  if (parent.actor_user_id && child.actor_user_id && parent.actor_user_id !== child.actor_user_id) return false;
  if (isBusinessAggregateAction(child.action_type)) return false;
  return typeof child.entity_id === "string" && entityIds.has(child.entity_id);
}

export function groupAuditEventsForDisplay<T extends AuditPresentationLog>(logs: T[]): Array<AuditDisplayGroup<T>> {
  const ordered = sortAuditLogsForPresentation(logs);
  const groupedChildIds = new Set<string>();
  const groups: Array<AuditDisplayGroup<T>> = [];

  for (const log of ordered) {
    if (log.id && groupedChildIds.has(log.id)) continue;
    const presentation = getAuditBusinessPresentation(log);
    const entityIds = snapshotEntityIds(log);
    const technicalChildren = presentation && entityIds.size > 1
      ? ordered.filter((candidate) => candidate.id !== log.id && isExactTechnicalChild(log, candidate, entityIds))
      : [];
    for (const child of technicalChildren) if (child.id) groupedChildIds.add(child.id);
    groups.push({ primary: log, technicalChildren, presentation });
  }
  return groups;
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
