/** Build stable navigation for reminders whose business subject is a tenant. */
export function tenantReminderHref(tenantId?: string | null) {
  return tenantId ? `/tenants?tenantId=${encodeURIComponent(tenantId)}` : "/tenants";
}
