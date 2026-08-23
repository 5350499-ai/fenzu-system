type SingleOwner = { id: string; workspaceOwnerId: string };
type SettlementShare = {
  id: string;
  workspaceOwnerId: string;
  propertyId: string;
  partnerId: string;
  percentage: number;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export function settlementSharesForProperty(
  propertyId: string,
  rangeStart: string,
  shares: SettlementShare[],
  partners: SingleOwner[],
  singleOwnerFallback: boolean
) {
  if (!singleOwnerFallback || partners.length !== 1 || shares.some((share) => share.propertyId === propertyId)) return shares;
  return [...shares, {
    id: `single-owner-${propertyId}-${rangeStart}`,
    workspaceOwnerId: partners[0].workspaceOwnerId,
    propertyId,
    partnerId: partners[0].id,
    percentage: 100,
    effectiveFrom: rangeStart,
    effectiveTo: null
  }];
}
