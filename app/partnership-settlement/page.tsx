"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { StatusBadge } from "@/components/status-badge";
import { BusinessExpense, BusinessProperty, BusinessRentPayment, expenseKey, getInitialExpenses, getInitialProperties, getInitialRentPayments, loadBusinessData, propertyKey, rentPaymentKey } from "@/lib/business-data";
import { buildSettlement, SettlementResult } from "@/lib/partner-settlement";
import { getPartners, PartnerWorkspaceData } from "@/lib/partners";
import { euro } from "@/lib/format";
import { paymentAccountingDate, rentIncomeForPayment } from "@/lib/profit";
import { useEffect, useMemo, useState } from "react";

type RangeMode = "current" | "previous" | "threeMonths" | "custom";
type Batch = { id: string; property_id: string; period_start: string; period_end: string; status: "confirmed" | "reversed"; total_income: number; total_expense: number; net_profit: number; confirmed_at: string; confirmed_by_account_id: string | null };

export default function PartnershipSettlementPage() {
  const access = useAccountAccess();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [partnerData, setPartnerData] = useState<PartnerWorkspaceData | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [rangeMode, setRangeMode] = useState<RangeMode>("current");
  const initialRange = presetRange("current");
  const [customStartDate, setCustomStartDate] = useState(initialRange.startDate);
  const [customEndDate, setCustomEndDate] = useState(initialRange.endDate);
  const [propertyId, setPropertyId] = useState("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const activeRange = useMemo(() => rangeMode === "custom" ? { startDate: customStartDate, endDate: customEndDate } : presetRange(rangeMode), [customEndDate, customStartDate, rangeMode]);
  const settlement = useMemo<SettlementResult>(() => buildSettlement(propertyId, activeRange, properties, partnerData?.partners || [], partnerData?.shares || [], payments, expenses), [activeRange, expenses, partnerData, payments, properties, propertyId]);
  const overlap = useMemo(() => propertyId === "all" ? null : batches.find((batch) => batch.status === "confirmed" && batch.property_id === propertyId && batch.period_start <= activeRange.endDate && batch.period_end >= activeRange.startDate) || null, [activeRange, batches, propertyId]);
  const exactBatch = useMemo(() => propertyId === "all" ? null : batches.find((batch) => batch.status === "confirmed" && batch.property_id === propertyId && batch.period_start === activeRange.startDate && batch.period_end === activeRange.endDate) || null, [activeRange, batches, propertyId]);

  useEffect(() => {
    if (!access.ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const loadedProperties = access.can("properties") ? await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : [];
        const [loadedPayments, loadedExpenses, loadedPartners] = await Promise.all([
          access.can("rent_payments") ? loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments()) : Promise.resolve([]),
          access.can("expenses") ? loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties)) : Promise.resolve([]),
          getPartners()
        ]);
        const response = await fetch("/api/partner-settlements", { cache: "no-store" });
        const batchPayload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(batchPayload.error || "加载结算历史失败");
        if (!cancelled) { setProperties(loadedProperties); setPayments(loadedPayments); setExpenses(loadedExpenses); setPartnerData(loadedPartners); setBatches(batchPayload.batches || []); }
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : "加载合伙结算失败"); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [access.ready]);

  async function confirmSettlement() {
    if (propertyId === "all" || overlap || settlement.unknownAttributions.length || settlement.invalidRange) return;
    const partnerSummary = settlement.partners
      .filter((partner) => settlement.segments.some((segment) => segment.shares.some((share) => share.partnerId === partner.partnerId)))
      .map((partner) => `${partner.displayName}：代收${euro(partner.collected)}／垫付${euro(partner.advanced)}／留存${euro(partner.actualRetained)}／应得${euro(partner.profitEntitlement)}`)
      .join("\n");
    const transferSummary = settlement.transfers.length
      ? settlement.transfers.map((transfer) => `${settlement.partners.find((partner) => partner.partnerId === transfer.fromPartnerId)?.displayName || ""} → ${settlement.partners.find((partner) => partner.partnerId === transfer.toPartnerId)?.displayName || ""}：${euro(transfer.amount)}`).join("\n")
      : "无需转账";
    if (!window.confirm(`确认保存结算快照吗？\n\n房源：${properties.find((property) => property.id === propertyId)?.name || ""}\n期间：${activeRange.startDate} 至 ${activeRange.endDate}\n总收入：${euro(settlement.totalIncome)}\n总支出：${euro(settlement.totalExpense)}\n净利润：${euro(settlement.netProfit)}\n\n参与合伙人及比例：\n${settlement.segments.map((segment) => `${segment.startDate} 至 ${segment.endDate}：${segment.shares.map((share) => `${settlement.partners.find((partner) => partner.partnerId === share.partnerId)?.displayName || "未知"} ${share.percentage}%`).join("、")}`).join("\n")}\n\n代收／垫付／留存／应得：\n${partnerSummary}\n\n转账建议：\n${transferSummary}\n\n确认后不会修改原始账目。`)) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/partner-settlements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId, startDate: activeRange.startDate, endDate: activeRange.endDate }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "结算确认失败");
      setMessage("结算快照已保存");
      const history = await fetch("/api/partner-settlements", { cache: "no-store" }).then((result) => result.json());
      setBatches(history.batches || []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "结算确认失败"); }
    finally { setLoading(false); }
  }

  return <AppLayout title="合伙结算" description="按房源、比例生效区间和真实收支归属生成动态合伙结算。">
    <section className="card panel">
      <div className="panel-header"><div><h2 className="panel-title">结算范围</h2><p className="muted">结算会按比例生效日期分段计算；原始收款和支出不会被修改。</p></div><a className="btn compact" href="/partner-settlements">结算历史</a></div>
      <div className="filter-grid">
        <div className="field"><label>时间范围</label><select value={rangeMode} onChange={(event) => setRangeMode(event.target.value as RangeMode)}><option value="current">本月</option><option value="previous">上月</option><option value="threeMonths">近3个月</option><option value="custom">自定义</option></select></div>
        <div className="field"><label>房源</label><select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="all">全部房源（仅试算）</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></div>
        {rangeMode === "custom" ? <><div className="field"><label>开始日期</label><input type="date" value={customStartDate} max={customEndDate || undefined} onChange={(event) => setCustomStartDate(event.target.value)} /></div><div className="field"><label>结束日期</label><input type="date" value={customEndDate} min={customStartDate || undefined} onChange={(event) => setCustomEndDate(event.target.value)} /></div></> : null}
      </div>
      <p className="muted">当前范围：{activeRange.startDate} 至 {activeRange.endDate}</p>
      {loading ? <p className="muted">加载中…</p> : null}{message ? <p className="success-text">{message}</p> : null}
      {overlap ? <div className="warning-text">所选时间段与已结算记录重叠，请调整日期后重试。已结算：{overlap.period_start} 至 {overlap.period_end}，净利润 {euro(Number(overlap.net_profit))}。</div> : null}
      {exactBatch ? <div className="success-text">已结算：确认时间 {new Date(exactBatch.confirmed_at).toLocaleString("zh-CN")}。<a href={`/partner-settlements/${exactBatch.id}`}>查看结算快照</a></div> : null}
      {settlement.unknownAttributions.length ? <div className="warning-text">存在无法识别归属的历史账目，当前只能试算，不能确认。</div> : null}
    </section>

    <section className="card compact-report-card"><CompactMetric label="总收入" value={euro(settlement.totalIncome)} /><CompactMetric label="总支出" value={euro(settlement.totalExpense)} /><CompactMetric label="净利润" value={euro(settlement.netProfit)} tone={settlement.netProfit < 0 ? "danger" : "profit"} /><CompactMetric label="比例分段" value={`${settlement.segments.length} 段`} /></section>

    <section className="card panel"><div className="panel-header"><div><h2 className="panel-title">动态合伙结算</h2><p className="muted">实际留存 = 代收 - 垫付；应付/应收 = 实际留存 - 应得利润。</p></div>{access.isOwner && propertyId !== "all" && !overlap && !exactBatch ? <button className="btn primary" type="button" disabled={loading || settlement.invalidRange || settlement.unknownAttributions.length > 0} onClick={() => void confirmSettlement()}>确认已结算</button> : null}</div><div className="settlement-grid compact-settlement-grid">{settlement.partners.filter((partner) => partner.collected || partner.advanced || partner.profitEntitlement || partner.balance || settlement.segments.some((segment) => segment.shares.some((share) => share.partnerId === partner.partnerId))).map((partner) => <article className="settlement-card" key={partner.partnerId}><div className="profit-card-head"><div><strong>{partner.displayName}</strong><p>{partner.legacyCode ? `兼容代码 ${partner.legacyCode}` : "动态合伙人"}</p></div><StatusBadge tone={partner.balance > 0 ? "amber" : partner.balance < 0 ? "blue" : "green"}>{partner.balance > 0 ? "应付" : partner.balance < 0 ? "应收" : "已平衡"}</StatusBadge></div><div className="profit-card-metrics"><span>代收 <b>{euro(partner.collected)}</b></span><span>垫付 <b>{euro(partner.advanced)}</b></span><span>实际留存 <b>{euro(partner.actualRetained)}</b></span><span>应得利润 <b>{euro(partner.profitEntitlement)}</b></span><span>结算余额 <b>{euro(partner.balance)}</b></span></div></article>)}</div>{settlement.transfers.length ? <div className="settlement-result"><h3>转账建议</h3>{settlement.transfers.map((transfer) => <p key={`${transfer.fromPartnerId}-${transfer.toPartnerId}`}><strong>{settlement.partners.find((partner) => partner.partnerId === transfer.fromPartnerId)?.displayName}</strong> 转给 <strong>{settlement.partners.find((partner) => partner.partnerId === transfer.toPartnerId)?.displayName}</strong> <span className="danger-text">{euro(transfer.amount)}</span></p>)}</div> : <p className="muted">当前无需互相转账。</p>}</section>

    <div className="grid dashboard-panels"><CompactDetailList title="收入归属明细" rows={payments.filter((payment) => inRange(paymentAccountingDate(payment), activeRange) && (propertyId === "all" || payment.propertyId === propertyId) && !isVoided(payment.notes)).map((payment) => ({ id: `income-${payment.id}`, date: paymentAccountingDate(payment), partner: displayPartner(payment.receivedBy, partnerData?.partners || []), type: payment.incomeItem || payment.incomeType || "房租收入", amount: rentIncomeForPayment(payment) }))} /><CompactDetailList title="支出归属明细" rows={expenses.filter((expense) => inRange(expense.paymentDate || `${expense.expenseMonth}-01`, activeRange) && (propertyId === "all" || expense.propertyId === propertyId) && !isVoided(expense.notes)).map((expense) => ({ id: `expense-${expense.id}`, date: expense.paymentDate || expense.expenseMonth, partner: displayPartner(expense.paidBy, partnerData?.partners || []), type: expense.category, amount: Number(expense.amount || 0) }))} /></div>
  </AppLayout>;
}

function CompactMetric({ label, value, tone }: { label: string; value: string; tone?: "danger" | "profit" }) { return <div className="compact-report-metric"><span>{label}</span><strong className={tone === "danger" ? "danger-text" : tone === "profit" ? "profit" : ""}>{value}</strong></div>; }
function CompactDetailList({ title, rows }: { title: string; rows: Array<{ id: string; date: string; partner: string; type: string; amount: number }> }) { return <section className="card panel"><h2 className="panel-title">{title}</h2><div className="settlement-detail-list">{rows.map((row) => <div className="settlement-detail-line" key={row.id}><span>{row.date}</span><b>{row.partner}</b><span>{row.type}</span><strong>{euro(row.amount)}</strong></div>)}{!rows.length ? <p className="muted">暂无明细</p> : null}</div></section>; }
function displayPartner(value: string | undefined, partners: PartnerWorkspaceData["partners"]) { const partner = partners.find((item) => item.id === value || item.displayName === value || (item.legacyCode || "").toUpperCase() === (value || "").toUpperCase()); return partner?.displayName || value || "未分配"; }
function isVoided(notes?: string) { return Boolean(notes?.includes("[已作废]") || notes?.toLowerCase().includes("[void]")); }
function inRange(value: string | null | undefined, range: { startDate: string; endDate: string }) { return Boolean(value && value >= range.startDate && value <= range.endDate); }
function presetRange(mode: Exclude<RangeMode, "custom">) { const today = new Date(); const year = today.getFullYear(); const month = today.getMonth(); if (mode === "previous") return { startDate: formatDate(new Date(year, month - 1, 1)), endDate: formatDate(new Date(year, month, 0)) }; if (mode === "threeMonths") return { startDate: formatDate(new Date(year, month - 2, 1)), endDate: formatDate(today) }; return { startDate: formatDate(new Date(year, month, 1)), endDate: formatDate(new Date(year, month + 1, 0)) }; }
function formatDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
