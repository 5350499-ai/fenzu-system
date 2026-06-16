"use client";

import { AppLayout } from "@/components/app-layout";
import { MetricCard } from "@/components/metric-card";
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
import { calculatePropertyProfit, getDateRange, RangePreset } from "@/lib/profit";
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
    }
    load().catch((error) => window.alert(`加载房源利润明细失败：${error.message || error}`));
  }, []);

  const property = properties.find((item) => item.id === propertyId);
  const range = useMemo(() => getDateRange(preset, customStart, customEnd), [customEnd, customStart, preset]);
  const stat = useMemo(() => property ? calculatePropertyProfit(property, rooms, payments, expenses, deposits, range) : null, [deposits, expenses, payments, property, range, rooms]);
  const scopedRooms = rooms.filter((room) => room.propertyId === propertyId);
  const vacantRooms = scopedRooms.filter((room) => room.status === "空置" || room.status === "空房");
  const overduePayments = stat?.payments.filter((payment) => payment.amountUnpaid > 0 || payment.isOverdue) || [];

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

      <div className="grid metrics">
        <MetricCard label="收入" value={euro(stat.income)} note="当前范围已收租金" tone="profit" />
        <MetricCard label="支出" value={euro(stat.expense)} note="当前范围支出合计" />
        <MetricCard label="净利润" value={euro(stat.netProfit)} note="收入 - 支出" tone={stat.netProfit < 0 ? "danger" : "profit"} hero />
        <MetricCard label="欠租金额" value={euro(stat.unpaid)} note="当前范围未收金额" tone={stat.unpaid > 0 ? "danger" : "info"} />
        <MetricCard label="空置房间" value={`${stat.vacantRooms} 间`} note="当前房源空置数量" />
        <MetricCard label="入住率" value={`${stat.occupancy}%`} note={`${stat.rentedRooms}/${stat.rentableRooms} 间可出租房间`} tone="info" />
      </div>

      <div className="grid dashboard-panels">
        <DetailTable title="收租明细" headers={["月份", "房间", "租客", "应收", "已收", "未收", "状态"]}>
          {stat.payments.map((payment) => {
            const room = rooms.find((item) => item.id === payment.roomId);
            const tenant = tenants.find((item) => item.id === payment.tenantId);
            return <tr key={payment.id}><td>{payment.rentMonth}</td><td>{room?.name || "-"}</td><td>{tenant?.name || "-"}</td><td>{euro(payment.amountDue)}</td><td>{euro(payment.amountPaid)}</td><td className={payment.amountUnpaid > 0 ? "danger-text" : ""}>{euro(payment.amountUnpaid)}</td><td><StatusBadge tone={payment.amountUnpaid > 0 ? "red" : "green"}>{payment.amountUnpaid > 0 ? "欠费" : "已收清"}</StatusBadge></td></tr>;
          })}
        </DetailTable>
        <DetailTable title="支出明细" headers={["月份", "日期", "类型", "金额", "付款方式", "状态"]}>
          {stat.expenses.map((expense) => <tr key={expense.id}><td>{expense.expenseMonth}</td><td>{expense.paymentDate || "-"}</td><td>{expense.category}</td><td>{euro(expense.amount)}</td><td>{expense.paymentMethod || "-"}</td><td><StatusBadge tone={expense.isPaid ? "green" : "red"}>{expense.isPaid ? "已支付" : "未支付"}</StatusBadge></td></tr>)}
        </DetailTable>
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

function DetailTable({ title, headers, children }: { title: string; headers: string[]; children: React.ReactNode }) {
  return (
    <section className="card panel">
      <h2 className="panel-title">{title}</h2>
      <div className="table-wrap">
        <table>
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}
