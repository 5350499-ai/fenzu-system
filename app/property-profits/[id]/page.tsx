"use client";

import { AppLayout } from "@/components/app-layout";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessDeposit,
  BusinessExpense,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  depositKey,
  expenseKey,
  getInitialDeposits,
  getInitialExpenses,
  getInitialProperties,
  getInitialRentPayments,
  getInitialRooms,
  getInitialTenants,
  loadBusinessData,
  propertyKey,
  rentPaymentKey,
  roomKey,
  tenantKey
} from "@/lib/business-data";
import { euro } from "@/lib/format";
import { downloadExpenseFile, ExpenseFile, loadExpenseFiles, openExpenseFile } from "@/lib/expense-files";
import { calculatePropertyProfit, getDateRange, RangePreset } from "@/lib/profit";
import { partnerClass, partnerLabel } from "@/lib/partner-settings";
import { downloadRentPaymentFile, loadRentPaymentFiles, openRentPaymentFile, RentPaymentFile } from "@/lib/rent-payment-files";
import { isCoverageExpired, isRentIncome, paymentCoverageEnd } from "@/lib/rent-coverage";
import { Download, Eye } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const detailRanges: { value: RangePreset; label: string }[] = [
  { value: "thisMonth", label: "本月" },
  { value: "last3Months", label: "最近3个月" },
  { value: "last12Months", label: "最近12个月" },
  { value: "custom", label: "自定义日期" }
];

export default function PropertyProfitDetailPage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [rentFiles, setRentFiles] = useState<RentPaymentFile[]>([]);
  const [expenseFiles, setExpenseFiles] = useState<ExpenseFile[]>([]);
  const [expandedRentId, setExpandedRentId] = useState("");
  const [expandedExpenseId, setExpandedExpenseId] = useState("");
  const [preset, setPreset] = useState<RangePreset>("thisMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms));
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments());
      const loadedExpenses = await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties));
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits());
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setPayments(loadedPayments);
      setExpenses(loadedExpenses);
      setDeposits(loadedDeposits);
      const [loadedRentFiles, loadedExpenseFiles] = await Promise.all([
        loadRentPaymentFiles(loadedPayments.map((payment) => payment.id)).catch(() => []),
        loadExpenseFiles(loadedExpenses.map((expense) => expense.id)).catch(() => [])
      ]);
      setRentFiles(loadedRentFiles);
      setExpenseFiles(loadedExpenseFiles);
    }
    load().catch((error) => window.alert(`加载房源利润明细失败：${error.message || error}`));
  }, []);

  const property = properties.find((item) => item.id === propertyId);
  const range = useMemo(() => getDateRange(preset, customStart, customEnd), [customEnd, customStart, preset]);
  const stat = useMemo(() => property ? calculatePropertyProfit(property, rooms, payments, expenses, deposits, range) : null, [deposits, expenses, payments, property, range, rooms]);
  const scopedRooms = rooms.filter((room) => room.propertyId === propertyId);
  const vacantRooms = scopedRooms.filter((room) => room.status === "空置" || room.status === "空房");
  const overduePayments = stat?.payments.filter((payment) => isCoverageExpired(payment)) || [];

  if (!property || !stat) {
    return (
      <AppLayout title="房源利润明细" description="未找到房源。">
        <section className="card panel">房源不存在或正在加载。</section>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`${property.name} 利润明细`} description="按当前房源单独核算收入、支出、净利润、欠租和空置。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">时间范围</h2>
            <p className="muted">{range.start} ～ {range.end}</p>
          </div>
        </div>
        <div className="filter-grid">
          <SearchableSelect label="时间范围" value={preset} options={detailRanges.map((item) => ({ value: item.value, label: item.label }))} onChange={(value) => setPreset(value as RangePreset)} />
          {preset === "custom" ? (
            <>
              <div className="field"><label>开始日期</label><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></div>
              <div className="field"><label>结束日期</label><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></div>
            </>
          ) : null}
        </div>
      </section>

      <section className="card compact-profit-summary" aria-label="利润汇总">
        <ProfitMetric label="收入" value={euro(stat.income)} tone="profit" />
        <ProfitMetric label="支出" value={euro(stat.expense)} />
        <ProfitMetric label="净利润" value={euro(stat.netProfit)} tone={stat.netProfit < 0 ? "danger" : "profit"} />
        <ProfitMetric label="欠租" value={euro(stat.unpaid)} tone={stat.unpaid > 0 ? "danger" : ""} />
        <ProfitMetric label="空置" value={`${stat.vacantRooms} 间`} />
        <ProfitMetric label="入住率" value={`${stat.occupancy}%`} />
      </section>

      <div className="profit-ledger-grid">
        <section className="card panel compact-ledger-panel">
          <h2 className="panel-title">收入明细</h2>
          <div className="profit-ledger-list">
          {stat.payments.length ? [...stat.payments].sort((a, b) => (b.paymentDate || b.rentMonth).localeCompare(a.paymentDate || a.rentMonth)).map((payment) => {
            const room = rooms.find((item) => item.id === payment.roomId);
            const tenant = tenants.find((item) => item.id === payment.tenantId);
            const expanded = expandedRentId === payment.id;
            const relatedFiles = rentFiles.filter((file) => file.rentPaymentId === payment.id);
            return <div className="profit-ledger-item" key={payment.id}>
              <button className="profit-ledger-line" onClick={() => setExpandedRentId(expanded ? "" : payment.id)} type="button">
                <span>{payment.paymentDate || payment.rentMonth}</span><b className={`partner-tag ${partnerClass(payment.receivedBy)}`}>{partnerLabel(payment.receivedBy)}</b><span>{profitPaymentLabel(payment, room?.name || "-", Number(payment.amountPaid || 0) > Number(payment.amountDue || 0))}</span><strong>{euro(payment.amountPaid)}</strong><StatusBadge tone={isCoverageExpired(payment) ? "red" : "green"}>{isRentIncome(payment) ? isCoverageExpired(payment) ? "已过期" : "已覆盖" : "已收"}</StatusBadge>
              </button>
              {expanded ? <div className="profit-ledger-detail"><span>租客：{tenant?.name || "-"}</span>{isRentIncome(payment) ? <span>覆盖至：{paymentCoverageEnd(payment) || "-"}</span> : null}<span>类型：{payment.incomeType || "房租收入"}</span>{payment.incomeItem ? <span>项目：{payment.incomeItem}</span> : null}<span>付款方式：{payment.paymentMethod || "-"}</span><span>备注：{payment.notes || "-"}</span><FileLinks files={relatedFiles} onOpen={openRentPaymentFile} onDownload={downloadRentPaymentFile} /></div> : null}
            </div>;
          }) : <p className="muted">暂无收租记录。</p>}
          </div>
        </section>
        <section className="card panel compact-ledger-panel">
          <h2 className="panel-title">支出明细</h2>
          <div className="profit-ledger-list">
          {stat.expenses.length ? [...stat.expenses].sort((a, b) => (b.paymentDate || b.expenseMonth).localeCompare(a.paymentDate || a.expenseMonth)).map((expense) => {
            const expanded = expandedExpenseId === expense.id;
            const relatedFiles = expenseFiles.filter((file) => file.expenseId === expense.id);
            return <div className="profit-ledger-item" key={expense.id}>
              <button className="profit-ledger-line" onClick={() => setExpandedExpenseId(expanded ? "" : expense.id)} type="button">
                <span>{expense.paymentDate || "-"}</span><b className={`partner-tag ${partnerClass(expense.paidBy)}`}>{partnerLabel(expense.paidBy)}</b><span>{expense.category}</span><strong>{euro(expense.amount)}</strong><StatusBadge tone={expense.isPaid ? "green" : "red"}>{expense.isPaid ? "已支付" : "未支付"}</StatusBadge>
              </button>
              {expanded ? <div className="profit-ledger-detail"><span>付款方式：{expense.paymentMethod || "-"}</span><span>付款归属：{expense.paidBy || "A"}</span><span>备注：{expense.notes || "-"}</span><FileLinks files={relatedFiles} onOpen={openExpenseFile} onDownload={downloadExpenseFile} /></div> : null}
            </div>;
          }) : <p className="muted">暂无支出记录。</p>}
          </div>
        </section>
      </div>

      <div className="grid dashboard-panels">
        <section className="card panel">
          <h2 className="panel-title">欠租情况</h2>
          <div className="list" style={{ marginTop: 14 }}>
            {overduePayments.length ? overduePayments.map((payment) => {
              const tenant = tenants.find((item) => item.id === payment.tenantId);
              const room = rooms.find((item) => item.id === payment.roomId);
              return <div className="list-item" key={payment.id}><div><div className="list-title">{tenant?.name || "-"} · {room?.name || "-"}</div><div className="list-meta">{payment.rentMonth}</div></div><strong className="danger-text">{euro(payment.amountUnpaid)}</strong></div>;
            }) : <div className="list-item"><span className="muted">当前范围暂无欠租。</span></div>}
          </div>
        </section>
        <section className="card panel">
          <h2 className="panel-title">空置情况</h2>
          <div className="list" style={{ marginTop: 14 }}>
            {vacantRooms.length ? vacantRooms.map((room) => <div className="list-item" key={room.id}><div><div className="list-title">{room.name}</div><div className="list-meta">编号：{room.roomNumber || "-"}</div></div><StatusBadge tone="blue">空置</StatusBadge></div>) : <div className="list-item"><span className="muted">当前没有空置房间。</span></div>}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function ProfitMetric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className={`compact-profit-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function FileLinks<T>({ files, onOpen, onDownload }: { files: T[]; onOpen: (file: T) => void; onDownload: (file: T) => void }) {
  return (
    <div className="profit-file-links">
      {files.length ? files.map((file: any) => <span key={file.id}><button className="btn" onClick={() => onOpen(file)} type="button"><Eye size={14} /> 查看附件</button><button className="btn" onClick={() => onDownload(file)} type="button"><Download size={14} /> 下载</button></span>) : <span className="muted">无附件</span>}
    </div>
  );
}

function depositPaymentMarker(paymentId: string) {
  return `[收租押金:${paymentId}]`;
}

function profitPaymentLabel(payment: BusinessRentPayment, roomName: string, hasDeposit: boolean) {
  if (isRentIncome(payment)) return `${roomName}房租${hasDeposit ? "+押金" : ""}`;
  if (payment.incomeType === "押金收入") return `${roomName}押金收入`;
  return payment.incomeItem || payment.incomeType || "其他收入";
}
