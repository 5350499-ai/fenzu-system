import Link from "next/link";
import type { DebtCase } from "@/lib/debt-case";
import { DebtRow } from "@/components/debt-row";

/** Focused reminder destination: deliberately excludes charts and raw history. */
export function DebtActionPanel({ debtCase, onWaive, focused = false }: { debtCase: DebtCase; onWaive: (debtCase: DebtCase) => void; focused?: boolean }) {
  return <section className={`record-detail-panel debt-action-panel${focused ? " debt-action-panel-focused" : ""}`} aria-label="欠费处理" data-payment-id={debtCase.paymentId}>
    <div className="detail-section-title">欠费处理</div>
    <DebtRow debtCase={debtCase} className="debt-row--panel" />
    <div className="debt-action-panel-actions">
      {debtCase.canCollect ? <Link className="btn primary" href={`/rent-payments?collectPayment=${encodeURIComponent(debtCase.paymentId)}&overdue=1`}>续交房租</Link> : null}
      {debtCase.canWaive ? <button className="btn warning" type="button" onClick={() => onWaive(debtCase)}>放弃追缴</button> : null}
    </div>
  </section>;
}

/** The tenant detail entry point: one compact, payment-specific action panel per open debt. */
export function TenantDebtActionStack({ debtCases, focusedPaymentId, onWaive }: { debtCases: readonly DebtCase[]; focusedPaymentId?: string; onWaive: (debtCase: DebtCase) => void }) {
  if (!debtCases.length) return null;
  return <section className="tenant-debt-action-stack" aria-label="租客欠费处理" data-testid="tenant-debt-action-stack">
    {debtCases.map((debtCase) => <DebtActionPanel key={debtCase.debtCaseId} debtCase={debtCase} focused={debtCase.paymentId === focusedPaymentId} onWaive={onWaive} />)}
  </section>;
}
