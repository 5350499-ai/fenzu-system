import type { BusinessExpense, BusinessRentPayment } from "./business-data";
import type { Partner, PartnerPropertyShare } from "./partners";

export type SettlementRange = { startDate: string; endDate: string };
export type SettlementSegment = {
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
};

export type SettlementBatchPeriod = {
  propertyId: string;
  periodStart: string;
  periodEnd: string;
  status: "confirmed" | "reversed";
};

export function hasSettlementOverlap(
  candidate: { propertyId: string; periodStart: string; periodEnd: string },
  batches: SettlementBatchPeriod[]
) {
  return batches.some((batch) => batch.status === "confirmed" && batch.propertyId === candidate.propertyId && candidate.periodStart <= batch.periodEnd && batch.periodStart <= candidate.periodEnd);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function inRange(value: string | null | undefined, range: SettlementRange) {
  return validDate(value) && value >= range.startDate && value <= range.endDate;
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.toLowerCase().includes("[void]"));
}

function resolvePartner(value: string | undefined, partners: Partner[]) {
  const normalized = (value || "").trim();
  if (!normalized) return null;
  const upper = normalized.toUpperCase();
  return partners.find((partner) =>
    partner.id === normalized ||
    partner.displayName === normalized ||
    (partner.legacyCode || "").toUpperCase() === upper
  ) || null;
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
  }).filter((segment) => segment.startDate <= segment.endDate && segment.shares.length > 0);
}

export function buildSettlement(
  propertyId: string,
  range: SettlementRange,
  properties: Array<{ id: string }>,
  partners: Partner[],
  shares: PartnerPropertyShare[],
  payments: BusinessRentPayment[],
  expenses: BusinessExpense[]
): SettlementResult {
  const invalidRange = !validDate(range.startDate) || !validDate(range.endDate) || range.startDate > range.endDate;
  const propertyIds = propertyId === "all" ? properties.map((property) => property.id) : [propertyId];
  const segments: SettlementSegment[] = [];
  const stats = new Map<string, SettlementPartnerStat>();
  const unknownAttributions: string[] = [];
  partners.forEach((partner) => stats.set(partner.id, { partnerId: partner.id, displayName: partner.displayName, legacyCode: partner.legacyCode, collected: 0, advanced: 0, actualRetained: 0, profitEntitlement: 0, balance: 0 }));
  if (invalidRange) return { totalIncome: 0, totalExpense: 0, netProfit: 0, segments, partners: [...stats.values()], transfers: [], unknownAttributions, invalidRange };

  for (const scopedPropertyId of propertyIds) {
    for (const segment of buildSegments(scopedPropertyId, range, shares)) {
      const segmentPayments = payments.filter((payment) => payment.propertyId === scopedPropertyId && inRange(paymentAccountingDate(payment), { startDate: segment.startDate, endDate: segment.endDate }) && !isVoided(payment.notes));
      const segmentExpenses = expenses.filter((expense) => expense.propertyId === scopedPropertyId && inRange(expense.paymentDate || `${expense.expenseMonth}-01`, { startDate: segment.startDate, endDate: segment.endDate }) && !isVoided(expense.notes));
      const income = roundMoney(segmentPayments.reduce((sum, payment) => sum + rentIncomeForPayment(payment), 0));
      const expense = roundMoney(segmentExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0));
      const netProfit = roundMoney(income - expense);
      segments.push({ startDate: segment.startDate, endDate: segment.endDate, income, expense, netProfit, shares: segment.shares });
      segment.shares.forEach((share) => {
        const stat = stats.get(share.partnerId);
        if (stat) stat.profitEntitlement = roundMoney(stat.profitEntitlement + netProfit * share.percentage / 100);
      });
      segmentPayments.forEach((payment) => {
        const partner = resolvePartner(payment.receivedBy, partners);
        if (!partner) { unknownAttributions.push(`income:${payment.id}`); return; }
        const stat = stats.get(partner.id)!;
        stat.collected = roundMoney(stat.collected + rentIncomeForPayment(payment));
      });
      segmentExpenses.forEach((expenseItem) => {
        const partner = resolvePartner(expenseItem.paidBy, partners);
        if (!partner) { unknownAttributions.push(`expense:${expenseItem.id}`); return; }
        const stat = stats.get(partner.id)!;
        stat.advanced = roundMoney(stat.advanced + Number(expenseItem.amount || 0));
      });
    }
  }
  const totalIncome = roundMoney(segments.reduce((sum, segment) => sum + segment.income, 0));
  const totalExpense = roundMoney(segments.reduce((sum, segment) => sum + segment.expense, 0));
  const netProfit = roundMoney(totalIncome - totalExpense);
  const resultPartners = [...stats.values()].map((stat) => ({ ...stat, actualRetained: roundMoney(stat.collected - stat.advanced), balance: roundMoney(stat.collected - stat.advanced - stat.profitEntitlement) }));
  return { totalIncome, totalExpense, netProfit, segments, partners: resultPartners, transfers: buildTransfers(resultPartners), unknownAttributions: [...new Set(unknownAttributions)], invalidRange };
}

function paymentAccountingDate(payment: BusinessRentPayment) {
  return payment.paymentDate || `${payment.rentMonth}-01`;
}

function rentIncomeForPayment(payment: BusinessRentPayment) {
  return Number(payment.amountPaid || 0);
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
