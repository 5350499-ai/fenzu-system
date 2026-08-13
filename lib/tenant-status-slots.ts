export type TenantStatusSlot = { label: string; tone?: string } | null;

export type TenantStatusSlotsInput = {
  lifecycleLabel: string;
  lifecycleTone?: string;
  hasCurrentDebt: boolean;
  hasHistoricalDebt: boolean;
  paymentPerformanceLabel: string;
  paymentPerformanceTone?: string;
  depositStatus: string;
  depositTone?: string;
};

/** Presentation-only mapping for the fixed Tenant List status row. */
export function getTenantStatusSlots(input: TenantStatusSlotsInput): readonly [TenantStatusSlot, TenantStatusSlot, TenantStatusSlot, TenantStatusSlot, TenantStatusSlot] {
  return [
    { label: input.lifecycleLabel, tone: input.lifecycleTone },
    input.hasCurrentDebt ? { label: "当前欠租", tone: "danger" } : null,
    input.hasHistoricalDebt ? { label: "历史欠费", tone: "danger" } : null,
    { label: input.paymentPerformanceLabel, tone: input.paymentPerformanceTone },
    { label: input.depositStatus, tone: input.depositTone }
  ];
}
