import type { DebtCase } from "./debt-case";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { euro } from "./format.ts";

export type DebtDisplayModel = {
  primaryLine: string;
  tenantName: string;
  contextLine: string;
  secondaryLine: string;
  lifecycleLabel: string;
  lifecycleTone: "green" | "amber" | "blue";
  debtKindLabel: string;
  amountLabel: string;
  availableActions: Array<"collect" | "waive">;
};

/** The shared, two-line presentation contract for every DebtCase surface. */
export function buildDebtDisplayModel(debtCase: DebtCase): DebtDisplayModel {
  const lifecycleLabel = debtCase.tenantLifecycle === "current" || debtCase.tenantLifecycle === "archived_current" ? "在租" : debtCase.tenantLifecycle === "moved_out" || debtCase.tenantLifecycle === "archived_moved_out" ? "已退租" : "租客状态待确认";
  const lifecycleTone = lifecycleLabel === "在租" ? "green" : lifecycleLabel === "已退租" ? "amber" : "blue";
  return {
    primaryLine: [debtCase.tenantName, debtCase.propertyName, debtCase.roomName].filter(Boolean).join(" | "),
    tenantName: debtCase.tenantName,
    contextLine: [debtCase.propertyName, debtCase.roomName].filter(Boolean).join(" | "),
    secondaryLine: `覆盖至 ${debtCase.dueDate || debtCase.coverageEnd || "-"} | 已逾期 ${debtCase.daysOverdue} 天 | ${euro(debtCase.remainingAmount)}`,
    lifecycleLabel,
    lifecycleTone,
    debtKindLabel: debtCase.debtKind === "current" ? "当前欠租" : "历史欠费",
    amountLabel: euro(debtCase.remainingAmount),
    availableActions: [...(debtCase.canCollect ? ["collect" as const] : []), ...(debtCase.canWaive ? ["waive" as const] : [])]
  };
}
