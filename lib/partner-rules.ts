export function validatePartnerPercentages(values: Array<number | string>) {
  const percentages = values.map((value) => Number(value));
  const validNumbers = percentages.every((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  const total = percentages.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  return { valid: validNumbers && percentages.length > 0 && Math.abs(total - 100) < 0.005, total, percentages };
}

export function validatePartnerPlanRows(rows: Array<{ partnerId: string; percentage: number | string }>) {
  const ids = rows.map((row) => row.partnerId.trim());
  const percentageResult = validatePartnerPercentages(rows.map((row) => row.percentage));
  return {
    valid: percentageResult.valid && ids.every(Boolean) && new Set(ids).size === ids.length,
    total: percentageResult.total,
    partnerIds: ids,
    percentages: percentageResult.percentages
  };
}

export function validateActivePartnerCount(count: number) {
  return Number.isInteger(count) && count >= 1 && count <= 5;
}

export function hasOverlappingShareIntervals(intervals: Array<{ effectiveFrom: string; effectiveTo?: string | null }>) {
  const sorted = [...intervals].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  return sorted.some((current, index) => {
    const previous = sorted[index - 1];
    return Boolean(previous && (!previous.effectiveTo || previous.effectiveTo >= current.effectiveFrom));
  });
}

export function resolveLegacyPartner<T extends { id: string; legacyCode: string | null }>(partners: T[], legacyCode?: string | null) {
  const code = (legacyCode || "").trim().toUpperCase();
  if (!code) return null;
  return partners.find((partner) => (partner.legacyCode || "").trim().toUpperCase() === code) || null;
}

export function canDeletePartner(partner: { id: string; legacyCode: string | null }, shares: Array<{ partnerId: string }>) {
  return !partner.legacyCode && !shares.some((share) => share.partnerId === partner.id);
}
