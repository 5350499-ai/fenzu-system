/** Build stable navigation for reminders whose business subject is a tenant. */
export function tenantReminderHref(tenantId?: string | null) {
  return tenantId ? `/tenants?tenantId=${encodeURIComponent(tenantId)}` : "/tenants";
}

/** Resolve a tenant reminder href against the loaded tenant collection. */
export function resolveTenantReminderTarget<T extends { id: string }>(href: string, tenants: T[]) {
  const tenantId = new URL(href, "https://reminder.local").searchParams.get("tenantId") || "";
  return tenants.find((tenant) => tenant.id === tenantId) || null;
}
