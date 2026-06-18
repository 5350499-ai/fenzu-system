import { isSupabaseConfigured, supabase } from "./supabase";

export type PartnerRatios = {
  A: number;
  B: number;
};

export type PartnerNames = {
  A: string;
  B: string;
};

export const defaultPartnerRatios: PartnerRatios = { A: 50, B: 50 };
const key = "partner-ratios-v1";
const namesKey = "partner-names-v1";
export const defaultPartnerNames: PartnerNames = { A: "A", B: "B" };

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

export async function loadPartnerNames(): Promise<PartnerNames> {
  const local = readLocalPartnerNames();
  if (!isSupabaseConfigured || !supabase) return local;
  const { data } = await supabase.auth.getUser();
  const stored = data.user?.user_metadata?.partner_names;
  const names = normalizePartnerNames(stored || local);
  window.localStorage.setItem(namesKey, JSON.stringify(names));
  return names;
}

export async function savePartnerNames(names: PartnerNames) {
  const normalized = normalizePartnerNames(names);
  if (typeof window !== "undefined") window.localStorage.setItem(namesKey, JSON.stringify(normalized));
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.auth.updateUser({ data: { partner_names: normalized } });
    if (error) throw error;
  }
  return normalized;
}

export function partnerLabel(partner: string | undefined, names: PartnerNames) {
  const code = (partner || "A").trim().toUpperCase() === "B" ? "B" : "A";
  return names[code] || code;
}

function readLocalPartnerNames(): PartnerNames {
  if (typeof window === "undefined") return defaultPartnerNames;
  try {
    return normalizePartnerNames(JSON.parse(window.localStorage.getItem(namesKey) || ""));
  } catch {
    return defaultPartnerNames;
  }
}

function normalizePartnerNames(value: Partial<PartnerNames> | null | undefined): PartnerNames {
  return {
    A: String(value?.A || "A").trim().slice(0, 20) || "A",
    B: String(value?.B || "B").trim().slice(0, 20) || "B"
  };
}
