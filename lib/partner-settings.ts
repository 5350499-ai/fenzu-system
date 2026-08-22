import { useEffect, useState } from "react";
import { buildActivePartnerOptions, buildAttributionOptions, buildPartnerDirectory, getCachedPartners, getPartners } from "./partners";

export type PartnerRatios = {
  A: number;
  B: number;
};

export const defaultPartnerRatios: PartnerRatios = { A: 50, B: 50 };
const key = "partner-ratios-v1";

export function loadPartnerRatios(): PartnerRatios {
  if (typeof window === "undefined") return defaultPartnerRatios;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "");
    const a = Number(parsed?.A);
    const b = Number(parsed?.B);
    if (Number.isFinite(a) && Number.isFinite(b) && Math.round(a + b) === 100) {
      return { A: a, B: b };
    }
  } catch {
    return defaultPartnerRatios;
  }
  return defaultPartnerRatios;
}

export function savePartnerRatios(ratios: PartnerRatios) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(ratios));
}

export function partnerLabel(partner?: string, directory?: Record<string, string>) {
  const value = (partner || "").trim();
  const code = value.toUpperCase();
  if (directory?.[value]) return directory[value];
  if (directory?.[code]) return directory[code];
  return value || "未设置";
}

export type PartnerDirectoryState = "loading" | "ready" | "unavailable";

/**
 * Historical records can still carry an A/B legacy attribution code.  That
 * code is an identifier, never a first-paint display name: wait for the
 * workspace directory instead of momentarily presenting the wrong identity.
 */
export function partnerDisplayLabel(partner: string | undefined, directory: Record<string, string>, state: PartnerDirectoryState) {
  if (state === "loading") return "归属加载中";
  if (state === "unavailable") return "归属暂不可用";
  return partnerLabel(partner, directory);
}

export function partnerDisplayClass(partner: string | undefined, state: PartnerDirectoryState) {
  return state === "ready" ? partnerClass(partner) : "partner-pending";
}

export function usePartnerDirectoryState(scope: string, isFreeSingle = false) {
  const cached = getCachedPartners(scope);
  const [directory, setDirectory] = useState<Record<string, string>>(() => cached ? buildPartnerDirectory(cached) : {});
  const [options, setOptions] = useState<PartnerOwnershipOption[]>(() => cached ? buildAttributionOptions(cached, isFreeSingle) : []);
  const [state, setState] = useState<PartnerDirectoryState>(cached ? "ready" : "loading");
  const [resolvedScope, setResolvedScope] = useState(scope);

  useEffect(() => {
    let active = true;
    setResolvedScope(scope);
    const warm = getCachedPartners(scope);
    if (warm) {
      setDirectory(buildPartnerDirectory(warm));
      setOptions(buildAttributionOptions(warm, isFreeSingle));
      setState("ready");
    } else {
      setDirectory({});
      setOptions([]);
      setState("loading");
    }
    if (!scope) return () => { active = false; };
    void getPartners().then((data) => {
      if (!active) return;
      setDirectory(buildPartnerDirectory(data));
      setOptions(buildAttributionOptions(data, isFreeSingle));
      setState("ready");
    }).catch(() => {
      if (!active) return;
      setState("unavailable");
    });
    return () => { active = false; };
  }, [isFreeSingle, scope]);

  const isCurrentScope = resolvedScope === scope;
  return {
    directory: isCurrentScope ? directory : {},
    options: isCurrentScope ? options : [],
    state: isCurrentScope ? state : "loading" as PartnerDirectoryState
  };
}

export function usePartnerDirectory() {
  const [directory, setDirectory] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    void getPartners().then((data) => {
      if (!active) return;
      setDirectory(buildPartnerDirectory(data));
    }).catch(() => { /* Keep the directory empty rather than inventing a partner. */ });
    return () => { active = false; };
  }, []);
  return directory;
}

export type PartnerOwnershipOption = { value: string; label: string };

export function usePartnerOwnershipOptions() {
  const [options, setOptions] = useState<PartnerOwnershipOption[]>([]);
  useEffect(() => {
    let active = true;
    void getPartners().then((data) => {
      if (!active) return;
      setOptions(buildActivePartnerOptions(data));
    }).catch(() => { /* Leave choices empty; callers must not synthesize A/B. */ });
    return () => { active = false; };
  }, []);
  return options;
}

export function partnerClass(partner?: string) {
  const code = (partner || "").trim().toUpperCase();
  if (code === "A") return "partner-a";
  if (code === "B") return "partner-b";
  return "partner-custom";
}
