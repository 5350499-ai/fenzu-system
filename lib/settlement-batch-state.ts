export type SettlementBatchPeriod = {
  id?: string;
  property_id: string;
  period_start: string;
  period_end: string;
  status: string;
};

export function findPreExistingSettlementConflict(
  batches: SettlementBatchPeriod[],
  propertyId: string,
  range: { startDate: string; endDate: string }
) {
  return batches.find((batch) => batch.status === "confirmed" && batch.property_id === propertyId && batch.period_start <= range.endDate && batch.period_end >= range.startDate) || null;
}
