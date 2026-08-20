export const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "CNY", "JPY"] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: CurrencyCode = "EUR";

export const CURRENCY_OPTIONS: Array<{ code: CurrencyCode; label: string }> = [
  { code: "EUR", label: "欧元 EUR (€)" },
  { code: "USD", label: "美元 USD ($)" },
  { code: "GBP", label: "英镑 GBP (£)" },
  { code: "CNY", label: "人民币 CNY (¥)" },
  { code: "JPY", label: "日元 JPY (¥)" }
];

let activeCurrency: CurrencyCode = DEFAULT_CURRENCY;

export function normalizeCurrencyCode(value: unknown): CurrencyCode {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value.toUpperCase())
    ? value.toUpperCase() as CurrencyCode
    : DEFAULT_CURRENCY;
}

export function setActiveCurrency(value: unknown) {
  activeCurrency = normalizeCurrencyCode(value);
}

export function getActiveCurrency(): CurrencyCode {
  return activeCurrency;
}

export function formatCurrency(value: number | string | null | undefined, currency: CurrencyCode = getActiveCurrency()) {
  const code = normalizeCurrencyCode(currency);
  const fractionDigits = code === "JPY" ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(Number(value || 0));
}
