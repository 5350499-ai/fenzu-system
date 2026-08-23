import type { BusinessExpense, BusinessRentPayment } from "./business-data";
import type { Partner, PartnerPropertyShare } from "./partners";
// Settlement and profit use the same canonical accounting-date and received-amount rules.
import { paymentAccountingDate, rentIncomeForPayment } from "./profit";
import { settlementSharesForProperty } from "./single-owner-settlement";
import { isValidSettlementRange, validDate } from "./settlement-date";
export { isValidSettlementRange, validDate } from "./settlement-date";

function isMonthInRange(month: string | null | undefined, range: SettlementRange) {
  if (!month) return false;
  const date = month.length === 7 ? `${month}-01` : month;
  return validDate(date) && date >= range.startDate && date <= range.endDate;
}

export type SettlementRange = { startDate: string; endDate: string };
export type SettlementSegment = {
  propertyId: string;
  startDate: string;
  endDate: string;
  income: number;
  expense: number;
  netProfit: number;
  shares: Array<{ partnerId: string; percentage: number }>;
};
export type SettlementPartnerStat = {
  partnerId: string;
  displayName: string;
  legacyCode: string | null;
  collected: number;
  advanced: number;
  actualRetained: number;
  profitEntitlement: number;
  balance: number;
};
export type SettlementTransfer = { fromPartnerId: string; toPartnerId: string; amount: number };
export type SettlementResult = {
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  segments: SettlementSegment[];
  partners: SettlementPartnerStat[];
  transfers: SettlementTransfer[];
  unknownAttributions: string[];
  invalidRange: boolean;
  coverageComplete: boolean;
  uncoveredRanges: Array<{ propertyId: string; startDate: string; endDate: string }>;
  baseIncomeTotal: number;
  baseExpenseTotal: number;
  segmentIncomeTotal: number;
  segmentExpenseTotal: number;
};

export type SettlementBatchPeriod = {
  propertyId: string;
  periodStart: string;
  periodEnd: string;
  status: "confirmed" | "reversed";
};

/** Counts only settlement batches that are still effective for the workspace. */
export function countEffectiveSettlementBatches(batches: Array<{ status?: string | null; deleted_at?: string | null; deletedAt?: string | null }>) {
  return batches.filter((batch) => batch.status === "confirmed" && !batch.deleted_at && !batch.deletedAt).length;
}

export function compareSettlementHistory(
  a: { status: "confirmed" | "reversed"; periodEnd: string; confirmedAt: string; reversedAt?: string | null },
  b: { status: "confirmed" | "reversed"; periodEnd: string; confirmedAt: string; reversedAt?: string | null }
) {
  if (a.status !== b.status) return a.status === "confirmed" ? -1 : 1;
  if (a.status === "confirmed") return b.periodEnd.localeCompare(a.periodEnd) || b.confirmedAt.localeCompare(a.confirmedAt);
  return String(b.reversedAt || "").localeCompare(String(a.reversedAt || "")) || b.periodEnd.localeCompare(a.periodEnd);
}

export function hasSettlementOverlap(
  candidate: { propertyId: string; periodStart: string; periodEnd: string },
  batches: SettlementBatchPeriod[]
) {
  return batches.some((batch) => batch.status === "confirmed" && batch.propertyId === candidate.propertyId && candidate.periodStart <= batch.periodEnd && batch.periodStart <= candidate.periodEnd);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function inRange(value: string | null | undefined, range: SettlementRange) {
  return validDate(value) && value >= range.startDate && value <= range.endDate;
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.toLowerCase().includes("[void]"));
}

function resolvePartner(value: string | undefined, partners: Partner[], accountAlias?: string | null) {
  const normalized = (value || "").trim();
  if (!normalized) return null;
  const upper = normalized.toUpperCase();
  const direct = partners.find((partner) =>
    partner.id === normalized ||
    partner.displayName === normalized ||
    (partner.legacyCode || "").toUpperCase() === upper
  );
  if (direct) return direct;
  if (partners.length === 1 && (normalized === "本人" || (accountAlias && normalized === accountAlias))) return partners[0];
  return null;
}

function planForDate(shares: PartnerPropertyShare[], propertyId: string, date: string) {
  const candidates = shares.filter((share) =>
    share.propertyId === propertyId &&
    share.effectiveFrom <= date &&
    (!share.effectiveTo || share.effectiveTo >= date)
  );
  const latest = candidates.reduce<string | null>((latestDate, share) =>
    !latestDate || share.effectiveFrom > latestDate ? share.effectiveFrom : latestDate, null);
  return latest ? candidates.filter((share) => share.effectiveFrom === latest).map((share) => ({ partnerId: share.partnerId, percentage: Number(share.percentage) })) : [];
}

function nextPlanDate(shares: PartnerPropertyShare[], propertyId: string, date: string, rangeEnd: string) {
  const futureDates = [...new Set(shares
    .filter((share) => share.propertyId === propertyId && share.effectiveFrom > date && share.effectiveFrom <= rangeEnd)
    .map((share) => share.effectiveFrom))].sort();
  return futureDates[0] || null;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildSegments(propertyId: string, range: SettlementRange, shares: PartnerPropertyShare[]) {
  if (!validDate(range.startDate) || !validDate(range.endDate) || range.startDate > range.endDate) return [];
  const boundaries = [range.startDate, ...[...new Set(shares
    .filter((share) => share.propertyId === propertyId && share.effectiveFrom > range.startDate && share.effectiveFrom <= range.endDate)
    .map((share) => share.effectiveFrom))].sort()];
  return boundaries.map((startDate) => {
    const next = nextPlanDate(shares, propertyId, startDate, range.endDate);
    return { startDate, endDate: next ? addDays(next, -1) : range.endDate, shares: planForDate(shares, propertyId, startDate) };
  }).filter((segment) => segment.startDate <= segment.endDate);
}

function mergeRanges(ranges: Array<{ propertyId: string; startDate: string; endDate: string }>) {
  return ranges.sort((a, b) => a.propertyId.localeCompare(b.propertyId) || a.startDate.localeCompare(b.startDate)).reduce<typeof ranges>((merged, range) => {
    const previous = merged[merged.length - 1];
    if (previous && previous.propertyId === range.propertyId && addDays(previous.endDate, 1) >= range.startDate) {
      previous.endDate = previous.endDate > range.endDate ? previous.endDate : range.endDate;
    } else {
      merged.push({ ...range });
    }
    return merged;
  }, []);
}

export function buildSettlement(
  propertyId: string | string[],
  range: SettlementRange,
  properties: Array<{ id: string }>,
  partners: Partner[],
  shares: PartnerPropertyShare[],
  payments: BusinessRentPayment[],
  expenses: BusinessExpense[],
  accountAlias?: string | null,
  singleOwnerFallback = false
): SettlementResult {
  const invalidRange = !isValidSettlementRange(range.startDate, range.endDate);
  const propertyIds = Array.isArray(propertyId) ? propertyId : propertyId === "all" ? properties.map((property) => property.id) : [propertyId];
  const segments: SettlementSegment[] = [];
  const stats = new Map<string, SettlementPartnerStat>();
  const unknownAttributions: string[] = [];
  const uncoveredRanges: Array<{ propertyId: string; startDate: string; endDate: string }> = [];
  partners.forEach((partner) => stats.set(partner.id, { partnerId: partner.id, displayName: partner.displayName, legacyCode: partner.legacyCode, collected: 0, advanced: 0, actualRetained: 0, profitEntitlement: 0, balance: 0 }));
  if (invalidRange) return { totalIncome: 0, totalExpense: 0, netProfit: 0, segments, partners: [...stats.values()], transfers: [], unknownAttributions, invalidRange, coverageComplete: false, uncoveredRanges, baseIncomeTotal: 0, baseExpenseTotal: 0, segmentIncomeTotal: 0, segmentExpenseTotal: 0 };

  for (const scopedPropertyId of propertyIds) {
    const scopedShares = settlementSharesForProperty(scopedPropertyId, range.startDate, shares, partners, singleOwnerFallback);
    for (const segment of buildSegments(scopedPropertyId, range, scopedShares)) {
      if (!segment.shares.length) uncoveredRanges.push({ propertyId: scopedPropertyId, startDate: segment.startDate, endDate: segment.endDate });
      const segmentPayments = payments.filter((payment) => payment.propertyId === scopedPropertyId && inRange(paymentAccountingDate(payment), { startDate: segment.startDate, endDate: segment.endDate }) && !isVoided(payment.notes));
      const segmentExpenses = expenses.filter((expense) => expense.propertyId === scopedPropertyId && inRange(expense.expenseMonth ? `${expense.expenseMonth}-01` : "", { startDate: segment.startDate, endDate: segment.endDate }) && !isVoided(expense.notes));
      const income = roundMoney(segmentPayments.reduce((sum, payment) => sum + rentIncomeForPayment(payment), 0));
      const expense = roundMoney(segmentExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0));
      const netProfit = roundMoney(income - expense);
      segments.push({ propertyId: scopedPropertyId, startDate: segment.startDate, endDate: segment.endDate, income, expense, netProfit, shares: segment.shares });
      segment.shares.forEach((share) => {
        const stat = stats.get(share.partnerId);
        if (stat) stat.profitEntitlement = roundMoney(stat.profitEntitlement + netProfit * share.percentage / 100);
      });
      segmentPayments.forEach((payment) => {
        const partner = resolvePartner(payment.receivedBy, partners, accountAlias);
        if (!partner) { unknownAttributions.push(`income:${payment.id}`); return; }
        const stat = stats.get(partner.id)!;
        stat.collected = roundMoney(stat.collected + rentIncomeForPayment(payment));
      });
      segmentExpenses.forEach((expenseItem) => {
        const partner = resolvePartner(expenseItem.paidBy, partners, accountAlias);
        if (!partner) { unknownAttributions.push(`expense:${expenseItem.id}`); return; }
        const stat = stats.get(partner.id)!;
        stat.advanced = roundMoney(stat.advanced + Number(expenseItem.amount || 0));
      });
    }
  }
  const mergedUncoveredRanges = mergeRanges(uncoveredRanges);
  const baseIncomeTotal = roundMoney(propertyIds.reduce((sum, scopedPropertyId) => sum + payments.filter((payment) => payment.propertyId === scopedPropertyId && inRange(paymentAccountingDate(payment), range) && !isVoided(payment.notes)).reduce((subtotal, payment) => subtotal + rentIncomeForPayment(payment), 0), 0));
  const baseExpenseTotal = roundMoney(propertyIds.reduce((sum, scopedPropertyId) => sum + expenses.filter((expense) => expense.propertyId === scopedPropertyId && isMonthInRange(expense.expenseMonth, range) && !isVoided(expense.notes)).reduce((subtotal, expense) => subtotal + Number(expense.amount || 0), 0), 0));
  const segmentIncomeTotal = roundMoney(segments.reduce((sum, segment) => sum + segment.income, 0));
  const segmentExpenseTotal = roundMoney(segments.reduce((sum, segment) => sum + segment.expense, 0));
  const coverageComplete = mergedUncoveredRanges.length === 0 && Math.abs(segmentIncomeTotal - baseIncomeTotal) < 0.01 && Math.abs(segmentExpenseTotal - baseExpenseTotal) < 0.01;
  const totalIncome = coverageComplete ? segmentIncomeTotal : 0;
  const totalExpense = coverageComplete ? segmentExpenseTotal : 0;
  const netProfit = roundMoney(totalIncome - totalExpense);
  const resultPartners = [...stats.values()].map((stat) => ({ ...stat, actualRetained: roundMoney(stat.collected - stat.advanced), balance: roundMoney(stat.collected - stat.advanced - stat.profitEntitlement) }));
  const visibleSegments = coverageComplete ? segments : [];
  return { totalIncome, totalExpense, netProfit, segments: visibleSegments, partners: resultPartners, transfers: coverageComplete ? buildTransfers(resultPartners) : [], unknownAttributions: [...new Set(unknownAttributions)], invalidRange, coverageComplete, uncoveredRanges: mergedUncoveredRanges, baseIncomeTotal, baseExpenseTotal, segmentIncomeTotal, segmentExpenseTotal };
}

export function buildTransfers(partners: SettlementPartnerStat[]): SettlementTransfer[] {
  const debtors = partners.map((partner) => ({ id: partner.partnerId, amount: Math.max(0, Math.round(partner.balance * 100)) })).filter((item) => item.amount > 0);
  const creditors = partners.map((partner) => ({ id: partner.partnerId, amount: Math.max(0, Math.round(-partner.balance * 100)) })).filter((item) => item.amount > 0);
  const transfers: SettlementTransfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const cents = Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount);
    if (cents > 0) transfers.push({ fromPartnerId: debtors[debtorIndex].id, toPartnerId: creditors[creditorIndex].id, amount: cents / 100 });
    debtors[debtorIndex].amount -= cents;
    creditors[creditorIndex].amount -= cents;
    if (debtors[debtorIndex].amount === 0) debtorIndex += 1;
    if (creditors[creditorIndex].amount === 0) creditorIndex += 1;
  }
  return transfers;
}

export { isVoided };
