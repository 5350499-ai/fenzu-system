/** Build stable navigation for reminders whose business subject is a tenant. */
export function tenantReminderHref(tenantId?: string | null) {
  return tenantId ? `/tenants?tenantId=${encodeURIComponent(tenantId)}` : "/tenants";
}

/** Debt navigation carries the payment-specific focus context; tenantId alone is not enough. */
export function tenantDebtHref(tenantId?: string | null, paymentId?: string | null) {
  if (!tenantId || !paymentId) return tenantReminderHref(tenantId);
  return `/tenants?tenantId=${encodeURIComponent(tenantId)}&paymentId=${encodeURIComponent(paymentId)}&focus=debt`;
}

export type TenantNavigationContext = { tenantId: string; paymentId: string; focus: "debt" } | { tenantId: string; paymentId: null; focus: "tenant" };

export function resolveTenantNavigationContext(href: string): TenantNavigationContext | null {
  const search = new URL(href, "https://reminder.local").searchParams;
  const tenantId = search.get("tenantId") || "";
  if (!tenantId) return null;
  const paymentId = search.get("paymentId") || "";
  return search.get("focus") === "debt" && paymentId
    ? { tenantId, paymentId, focus: "debt" }
    : { tenantId, paymentId: null, focus: "tenant" };
}

/** Resolve a tenant reminder href against the loaded tenant collection. */
export function resolveTenantReminderTarget<T extends { id: string }>(href: string, tenants: T[]) {
  const context = resolveTenantNavigationContext(href);
  return tenants.find((tenant) => tenant.id === context?.tenantId) || null;
}
