export const PAYMENT_METHOD_PRESETS = ["现金", "转账", "其他"] as const;

export type PaymentMethodOption = { value: string; label: string };

/**
 * New forms use the compact shared presets. Existing records may contain a
 * historical local payment method (for example Bizum), which remains visible
 * and editable without rewriting the stored business record.
 */
export function paymentMethodOptions(currentValue?: string): PaymentMethodOption[] {
  const options = PAYMENT_METHOD_PRESETS.map((value) => ({ value, label: value }));
  const value = String(currentValue || "").trim();
  return value && !options.some((option) => option.value === value)
    ? [...options, { value, label: value }]
    : options;
}
