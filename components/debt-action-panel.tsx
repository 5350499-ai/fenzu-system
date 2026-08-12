import Link from "next/link";
import type { DebtCase } from "@/lib/debt-case";
import { DebtRow } from "@/components/debt-row";

/** Focused reminder destination: deliberately excludes charts and raw history. */
export function DebtActionPanel({ debtCase, onWaive }: { debtCase: DebtCase; onWaive: (debtCase: DebtCase) => void }) {
  return <section className="record-detail-panel debt-action-panel" aria-label="欠费处理">
    <div className="detail-section-title">欠费处理</div>
    <DebtRow debtCase={debtCase} className="debt-row--panel" />
    <div className="debt-action-panel-actions">
      {debtCase.canCollect ? <Link className="btn primary" href={`/rent-payments?collectPayment=${encodeURIComponent(debtCase.paymentId)}&overdue=1`}>续交房租</Link> : null}
      {debtCase.canWaive ? <button className="btn warning" type="button" onClick={() => onWaive(debtCase)}>放弃追缴</button> : null}
    </div>
  </section>;
}
