import { useEffect, useState } from "react";
import { buildActivePartnerOptions, buildPartnerDirectory, getPartners } from "./partners";

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
