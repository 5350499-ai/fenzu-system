import { useEffect, useState } from "react";
import { getPartners, type PartnerWorkspaceData } from "./partners";

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
  const value = (partner || "A").trim();
  const code = value.toUpperCase();
  if (directory?.[value]) return directory[value];
  if (directory?.[code]) return directory[code];
  if (code === "A" || code === "B") return code;
  return value || "A";
}

export function usePartnerDirectory() {
  const [directory, setDirectory] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    void getPartners().then((data: PartnerWorkspaceData) => {
      if (!active) return;
      const next: Record<string, string> = {};
      for (const partner of data.partners) {
        next[partner.id] = partner.displayName;
        if (partner.legacyCode) next[partner.legacyCode] = partner.displayName;
        if (partner.legacyCode) next[partner.legacyCode.toUpperCase()] = partner.displayName;
      }
      setDirectory(next);
    }).catch(() => { /* Existing A/B fallback remains if directory loading fails. */ });
    return () => { active = false; };
  }, []);
  return directory;
}

export type PartnerOwnershipOption = { value: string; label: string };

export function usePartnerOwnershipOptions() {
  const [options, setOptions] = useState<PartnerOwnershipOption[]>([]);
  useEffect(() => {
    let active = true;
    void getPartners().then((data: PartnerWorkspaceData) => {
      if (!active) return;
      setOptions(data.partners
        .filter((partner) => partner.isActive)
        .map((partner) => ({ value: partner.legacyCode || partner.id, label: partner.displayName })));
    }).catch(() => { /* Existing A/B fallback remains if partner data is unavailable. */ });
    return () => { active = false; };
  }, []);
  return options;
}

export function partnerClass(partner?: string) {
  const code = (partner || "A").trim().toUpperCase();
  if (code === "A") return "partner-a";
  if (code === "B") return "partner-b";
  return "partner-custom";
}
