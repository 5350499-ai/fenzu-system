import type { ReminderItem, ReminderSnapshot } from "./reminder-engine";
// @ts-expect-error Node's strip-types test runner needs an explicit TypeScript extension here.
import { resolveTenantNavigationContext, tenantDebtHref } from "./reminder-navigation.ts";

/**
 * Test/development-only invariant checker for payment-backed reminder subjects.
 * It deliberately checks IDs rather than room occupancy or display text so a
 * re-let room can never rewrite an older payment's tenant context.
 */
export type ReminderEntityConsistencyIssue = {
  reminderId: string;
  code: string;
  message: string;
};

export function validateReminderEntityConsistency(
  reminders: ReminderItem[],
  snapshot: Pick<ReminderSnapshot, "tenants" | "rentPayments">
): ReminderEntityConsistencyIssue[] {
  const paymentsById = new Map(snapshot.rentPayments.map((payment) => [payment.id, payment]));
  const tenantsById = new Map(snapshot.tenants.map((tenant) => [tenant.id, tenant]));
  const seenPaymentReminderIds = new Set<string>();
  const issues: ReminderEntityConsistencyIssue[] = [];

  for (const reminder of reminders) {
    if (reminder.type !== "rent_debt" && reminder.type !== "rent_collection") continue;
    const paymentId = reminder.paymentId;
    if (!paymentId) {
      issues.push(issue(reminder, "missing-payment", "Rent reminder is missing paymentId."));
      continue;
    }
    const derivedMatch = /^derived_rent_debt:([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(paymentId);
    if (derivedMatch) {
      const tenant = tenantsById.get(derivedMatch[1]);
      if (!tenant) {
        issues.push(issue(reminder, "unknown-tenant", `Derived debt ${paymentId} references a missing tenant.`));
        continue;
      }
      if (reminder.tenantId !== tenant.id || reminder.propertyId !== tenant.propertyId || reminder.roomId !== tenant.roomId) {
        issues.push(issue(reminder, "derived-entity-mismatch", `Derived debt ${paymentId} must preserve the tenant's current subject context.`));
      }
      if (reminder.debtCase?.tenantName !== tenant.name) {
        issues.push(issue(reminder, "display-name-mismatch", `Derived debt ${paymentId} display name must come from its tenant.`));
      }
      if (reminder.navigationTarget.kind !== "tenant"
        || reminder.navigationTarget.tenantId !== tenant.id
        || reminder.navigationTarget.href !== tenantDebtHref(tenant.id, paymentId)) {
        issues.push(issue(reminder, "tenant-navigation-mismatch", `Derived debt ${paymentId} navigation must target its tenant.`));
      }
      continue;
    }
    const payment = paymentsById.get(paymentId);
    if (!payment) {
      issues.push(issue(reminder, "unknown-payment", `Payment ${paymentId} is not present in the reminder snapshot.`));
      continue;
    }
    if (seenPaymentReminderIds.has(paymentId)) {
      issues.push(issue(reminder, "duplicate-payment-reminder", `Payment ${paymentId} produced more than one rent reminder.`));
    }
    seenPaymentReminderIds.add(paymentId);
    if (reminder.tenantId !== payment.tenantId) {
      issues.push(issue(reminder, "payment-tenant-mismatch", `Reminder tenantId must equal payment ${paymentId} tenantId.`));
    }
    if (reminder.propertyId !== payment.propertyId) {
      issues.push(issue(reminder, "payment-property-mismatch", `Reminder propertyId must equal payment ${paymentId} propertyId.`));
    }
    if (reminder.roomId !== payment.roomId) {
      issues.push(issue(reminder, "payment-room-mismatch", `Reminder roomId must equal payment ${paymentId} roomId.`));
    }
    const tenant = tenantsById.get(payment.tenantId);
    if (!tenant) {
      issues.push(issue(reminder, "unknown-tenant", `Payment ${paymentId} references a missing tenant.`));
      continue;
    }
    if (reminder.debtCase?.tenantName !== tenant.name) {
      issues.push(issue(reminder, "display-name-mismatch", `Reminder display name must come from payment ${paymentId} tenant.`));
    }
    if (reminder.navigationTarget.kind !== "tenant"
      || reminder.navigationTarget.tenantId !== payment.tenantId
      || reminder.navigationTarget.href !== tenantDebtHref(payment.tenantId, paymentId)) {
      issues.push(issue(reminder, "tenant-navigation-mismatch", `Reminder navigation must target payment ${paymentId} tenant.`));
    }
    if (resolveTenantNavigationContext(reminder.navigationTarget.href)?.tenantId !== payment.tenantId) {
      issues.push(issue(reminder, "tenant-detail-target-mismatch", `Reminder href must resolve to payment ${paymentId} tenant detail.`));
    }
    if (reminder.navigationTarget.paymentId !== paymentId
      || reminder.navigationTarget.roomId !== payment.roomId
      || reminder.navigationTarget.propertyId !== payment.propertyId) {
      issues.push(issue(reminder, "navigation-context-mismatch", `Reminder navigation context must preserve payment ${paymentId} property and room.`));
    }
  }
  return issues;
}

function issue(reminder: ReminderItem, code: string, message: string): ReminderEntityConsistencyIssue {
  return { reminderId: reminder.id, code, message };
}
