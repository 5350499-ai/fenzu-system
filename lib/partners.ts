import { getValidSupabaseSession } from "./supabase";
export { canDeletePartner, hasOverlappingShareIntervals, resolveLegacyPartner, validateActivePartnerCount, validatePartnerPercentages, validatePartnerPlanRows } from "./partner-rules";

export type Partner = {
  id: string;
  workspaceOwnerId: string;
  legacyCode: string | null;
  displayName: string;
  colorKey: string | null;
  sortOrder: number;
  isActive: boolean;
  linkedAccountId: string | null;
  propertyCount: number;
  currentPropertyCount: number;
  futurePropertyCount: number;
};

export type PartnerPropertyShare = {
  id: string;
  workspaceOwnerId: string;
  propertyId: string;
  partnerId: string;
  percentage: number;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type PartnerProperty = { id: string; name: string; address: string | null; city: string | null };
export type PartnerNameHistory = { id: string; partnerId: string; oldDisplayName: string; newDisplayName: string; changedAt: string; changedByAccountId: string | null };

export type PartnerWorkspaceData = {
  partners: Partner[];
  shares: PartnerPropertyShare[];
  properties: PartnerProperty[];
  nameHistory?: PartnerNameHistory[];
};

export function getCurrentPropertySharePlan(shares: PartnerPropertyShare[], propertyId: string, today = new Date().toISOString().slice(0, 10)) {
  const candidates = shares
    .filter((share) => share.propertyId === propertyId && share.effectiveFrom <= today && (!share.effectiveTo || share.effectiveTo >= today))
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));
  const start = candidates[0]?.effectiveFrom;
  return start ? candidates.filter((share) => share.effectiveFrom === start) : [];
}

export function getPropertyPartnerShares(shares: PartnerPropertyShare[], propertyId: string) {
  return shares.filter((share) => share.propertyId === propertyId);
}

export async function getPartners(): Promise<PartnerWorkspaceData> {
  const session = await getValidSupabaseSession();
  if (!session?.access_token) throw new Error("登录已失效，请重新登录");
  const response = await fetch("/api/partners", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "加载合伙人资料失败");
  return body as PartnerWorkspaceData;
}

export async function getActivePartners(data?: PartnerWorkspaceData) {
  const source = data || await getPartners();
  return source.partners.filter((partner) => partner.isActive).sort((left, right) => left.sortOrder - right.sortOrder);
}

export async function canDeletePartnerFromServer(partnerId: string) {
  const data = await getPartners();
  const partner = data.partners.find((item) => item.id === partnerId);
  return Boolean(partner && data.shares.every((share) => share.partnerId !== partner.id) && !partner.legacyCode);
}
