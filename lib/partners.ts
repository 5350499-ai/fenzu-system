import { getValidSupabaseSession } from "./supabase";
import { cacheManager } from "./cache/cache-manager";
import { PARTNER_SETTLEMENT_CACHE_KEY } from "./cache/cache-keys";
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
  accountAlias?: string | null;
};

export type PartnerOption = { value: string; label: string };

/**
 * The partners API is the sole source of truth for attribution choices.
 * Legacy codes remain aliases in the directory so historical records keep
 * their original stored value while displaying the current partner name.
 */
export function buildPartnerDirectory(data: PartnerWorkspaceData) {
  const directory: Record<string, string> = {};
  for (const partner of data.partners) {
    directory[partner.id] = partner.displayName;
    if (partner.legacyCode) {
      directory[partner.legacyCode] = partner.displayName;
      directory[partner.legacyCode.toUpperCase()] = partner.displayName;
    }
  }
  const linked = data.partners.filter((partner) => partner.isActive && partner.linkedAccountId);
  if (linked.length === 1) {
    const member = linked[0];
    directory["本人"] = member.displayName;
    directory[member.linkedAccountId!] = member.displayName;
    if (data.accountAlias) directory[data.accountAlias] = member.displayName;
  }
  return directory;
}

export function buildActivePartnerOptions(data: PartnerWorkspaceData): PartnerOption[] {
  return data.partners
    .filter((partner) => partner.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((partner) => ({ value: partner.legacyCode || partner.id, label: partner.displayName }));
}

/**
 * A free-single workspace still has one real owner member. This fallback is
 * presentation-only continuity when a directory read is temporarily down;
 * server write roots always replace it with the canonical owner member id.
 */
export function buildAttributionOptions(data: PartnerWorkspaceData | null, isFreeSingle = false): PartnerOption[] {
  const options = data ? buildActivePartnerOptions(data) : [];
  return options.length || !isFreeSingle ? options : [{ value: "本人", label: "当前 Owner（100%）" }];
}

/** Keeps a stored legacy/inactive attribution selectable only while editing it. */
export function preserveStoredPartnerOption(options: PartnerOption[], value?: string, directory: Record<string, string> = {}) {
  const storedValue = (value || "").trim();
  if (!storedValue || options.some((option) => option.value === storedValue)) return options;
  return [{ value: storedValue, label: `${directory[storedValue] || storedValue}（历史）` }, ...options];
}

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

async function getPartnersFromServer(): Promise<PartnerWorkspaceData> {
  const session = await getValidSupabaseSession();
  if (!session?.access_token) throw new Error("登录已失效，请重新登录");
  const response = await fetch("/api/partners", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "加载合伙人资料失败");
  return body as PartnerWorkspaceData;
}

export async function getPartners(): Promise<PartnerWorkspaceData> {
  const session = await getValidSupabaseSession();
  if (!session?.user?.id) throw new Error("Session expired");
  return cacheManager.get("partners", { scope: session.user.id, loader: getPartnersFromServer });
}

/**
 * Synchronous warm-cache read for first paint. IndexedDB remains async, but
 * once this workspace's directory has been resolved in this tab, pages can
 * render the same real identity immediately instead of briefly re-entering a
 * neutral/loading state.
 */
export function getCachedPartners(scope: string) {
  return scope ? cacheManager.peekMemory<PartnerWorkspaceData>("partners", scope) : null;
}

export async function refreshPartners(): Promise<PartnerWorkspaceData> {
  const session = await getValidSupabaseSession();
  if (!session?.user?.id) throw new Error("Session expired");
  const value = await getPartnersFromServer();
  await cacheManager.set("partners", value, session.user.id);
  return value;
}

export async function invalidatePartnersCache() {
  const session = await getValidSupabaseSession();
  if (session?.user?.id) await cacheManager.invalidate(["partners", PARTNER_SETTLEMENT_CACHE_KEY], session.user.id);
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
