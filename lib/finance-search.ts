export function normalizeFinanceSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeFinanceAmount(value: unknown) {
  let text = normalizeFinanceSearchText(value)
    .replace(/[€$£¥]/g, "")
    .replace(/\s/g, "");
  if (!text || !/[0-9]/.test(text)) return "";
  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (text.includes(",")) {
    text = /,\d{1,2}$/.test(text) ? text.replace(",", ".") : text.replace(/,/g, "");
  }
  return text;
}

export function matchesFinanceSearch(query: string, fields: unknown[]) {
  const needle = normalizeFinanceSearchText(query);
  if (!needle) return true;
  const values = fields.map(normalizeFinanceSearchText).filter(Boolean);
  if (values.some((value) => value.includes(needle))) return true;
  const amountNeedle = normalizeFinanceAmount(query);
  if (!amountNeedle) return false;
  return fields.some((field) => {
    const amount = normalizeFinanceAmount(field);
    return Boolean(amount && amount.includes(amountNeedle));
  });
}
