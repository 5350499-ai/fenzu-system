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
