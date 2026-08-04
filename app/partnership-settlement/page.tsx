"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { StatusBadge } from "@/components/status-badge";
import { BusinessExpense, BusinessProperty, BusinessRentPayment, expenseKey, getInitialExpenses, getInitialProperties, getInitialRentPayments, loadBusinessData, propertyKey, rentPaymentKey } from "@/lib/business-data";
import { buildSettlement, SettlementResult } from "@/lib/partner-settlement";
import { PartnerWorkspaceData } from "@/lib/partners";
import { getValidSupabaseSession } from "@/lib/supabase";
import { euro } from "@/lib/format";
import { isMonthInRange, paymentAccountingDate, rentIncomeForPayment } from "@/lib/profit";
import { useEffect, useMemo, useState } from "react";

type RangeMode = "previous" | "threeMonths" | "custom";
type Batch = { id: string; property_id: string; period_start: string; period_end: string; status: "confirmed" | "reversed"; total_income: number; total_expense: number; net_profit: number; confirmed_at: string; confirmed_by_account_id: string | null };
type LoadState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";

class SettlementPageError extends Error { constructor(message: string, readonly code: string) { super(message); } }

async function readApi(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new SettlementPageError(String(payload.error || "加载失败，请稍后重试。"), String(payload.code || (response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "load_failed")));
  return payload;
}

export default function PartnershipSettlementPage() {
  const access = useAccountAccess();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadMessage, setLoadMessage] = useState("");
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [partnerData, setPartnerData] = useState<PartnerWorkspaceData | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const defaultRange = presetRange("previous");
  const [propertyId, setPropertyId] = useState("");
  const [rangeMode, setRangeMode] = useState<RangeMode>("previous");
  const [customStartDate, setCustomStartDate] = useState(defaultRange.startDate);
  const [customEndDate, setCustomEndDate] = useState(defaultRange.endDate);
  const [trialKey, setTrialKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const activeRange = useMemo(() => rangeMode === "custom" ? { startDate: customStartDate, endDate: customEndDate } : presetRange(rangeMode), [customEndDate, customStartDate, rangeMode]);
  const currentKey = `${propertyId}|${activeRange.startDate}|${activeRange.endDate}`;
  const settlement = useMemo<SettlementResult | null>(() => {
    if (!trialKey || trialKey !== currentKey || !partnerData || !propertyId) return null;
    return buildSettlement(propertyId, activeRange, properties, partnerData.partners, partnerData.shares, payments, expenses);
  }, [activeRange, currentKey, expenses, partnerData, payments, properties, propertyId, trialKey]);
  const overlap = useMemo(() => !settlement || !propertyId ? null : batches.find((batch) => batch.status === "confirmed" && batch.property_id === propertyId && batch.period_start <= activeRange.endDate && batch.period_end >= activeRange.startDate) || null, [activeRange, batches, propertyId, settlement]);
  const exactBatch = useMemo(() => !settlement || !propertyId ? null : batches.find((batch) => batch.status === "confirmed" && batch.property_id === propertyId && batch.period_start === activeRange.startDate && batch.period_end === activeRange.endDate) || null, [activeRange, batches, propertyId, settlement]);

  useEffect(() => {
    if (!access.ready) return;
    let cancelled = false;
    async function load() {
      setLoadState("loading"); setLoadMessage("");
      try {
        const session = await getValidSupabaseSession();
        if (!session) throw new SettlementPageError("登录已失效，请重新登录。", "unauthorized");
        const headers = { Authorization: `Bearer ${session.access_token}` };
        const [loadedProperties, loadedPayments, loadedExpenses, partnerPayload, batchPayload] = await Promise.all([
          access.can("properties") ? loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : Promise.resolve([]),
          access.can("rent_payments") ? loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments()) : Promise.resolve([]),
          access.can("expenses") ? loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses()) : Promise.resolve([]),
          fetch("/api/partners", { headers, cache: "no-store" }).then(readApi),
          fetch("/api/partner-settlements", { headers, cache: "no-store" }).then(readApi)
        ]);
        if (!loadedProperties.length) throw new SettlementPageError("当前工作区没有可用房源。", "no_data");
        if (!cancelled) {
          setProperties(loadedProperties); setPropertyId((current) => current || loadedProperties[0].id); setPayments(loadedPayments); setExpenses(loadedExpenses); setPartnerData(partnerPayload); setBatches(batchPayload.batches || []); setLoadState("ready");
        }
      } catch (error) {
        if (cancelled) return;
        const code = error instanceof SettlementPageError ? error.code : error instanceof Error && error.message.includes("登录") ? "unauthorized" : "load_failed";
        setLoadState(code === "unauthorized" ? "unauthorized" : code === "forbidden" ? "forbidden" : "error"); setLoadMessage(error instanceof Error ? error.message : "加载结算数据失败，请稍后重试。");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [access.ready]);

  function invalidateTrial() { setTrialKey(""); setMessage(""); }
  function changeProperty(value: string) { setPropertyId(value); invalidateTrial(); }
  function changeRangeMode(value: RangeMode) { setRangeMode(value); invalidateTrial(); }
  function changeCustomStart(value: string) { setCustomStartDate(value); invalidateTrial(); }
  function changeCustomEnd(value: string) { setCustomEndDate(value); invalidateTrial(); }
  function startTrial() {
    if (!propertyId || !activeRange.startDate || !activeRange.endDate) { setMessage("请选择房源、开始日期和结束日期。"); return; }
    if (activeRange.startDate > activeRange.endDate) { setMessage("开始日期不得晚于结束日期。"); return; }
    setMessage(""); setTrialKey(currentKey);
  }
  function resetFilters() { const next = presetRange("previous"); setRangeMode("previous"); setCustomStartDate(next.startDate); setCustomEndDate(next.endDate); setTrialKey(""); setMessage(""); }

  async function confirmSettlement() {
    if (!settlement || propertyId === "all" || overlap || exactBatch || settlement.unknownAttributions.length || settlement.invalidRange) return;
    const propertyName = properties.find((property) => property.id === propertyId)?.name || "";
    if (!window.confirm(`确认保存结算快照吗？\n\n房源：${propertyName}\n期间：${activeRange.startDate} 至 ${activeRange.endDate}\n总收入：${euro(settlement.totalIncome)}\n总支出：${euro(settlement.totalExpense)}\n净利润：${euro(settlement.netProfit)}\n\n确认后不会修改原始账目。`)) return;
    setBusy(true); setMessage("");
    try {
      const session = await getValidSupabaseSession();
      if (!session) throw new SettlementPageError("登录已失效，请重新登录。", "unauthorized");
      const response = await fetch("/api/partner-settlements", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ propertyId, startDate: activeRange.startDate, endDate: activeRange.endDate }) });
      const payload = await readApi(response);
      setMessage("结算快照已保存");
      setBatches((current) => [...current, { id: payload.batchId, property_id: propertyId, period_start: activeRange.startDate, period_end: activeRange.endDate, status: "confirmed", total_income: settlement.totalIncome, total_expense: settlement.totalExpense, net_profit: settlement.netProfit, confirmed_at: new Date().toISOString(), confirmed_by_account_id: null }]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "结算确认失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  if (loadState === "loading") return <AppLayout title="合伙结算"><section className="card panel"><p className="muted">正在加载结算数据…</p></section></AppLayout>;
  if (loadState === "unauthorized") return <AuthExpiredState />;
  if (loadState === "forbidden") return <AppLayout title="合伙结算"><section className="card panel"><h2 className="panel-title">没有访问权限</h2><p className="muted">当前账号没有查看合伙结算的权限。</p></section></AppLayout>;
  if (loadState === "error") return <AppLayout title="合伙结算"><section className="card panel"><h2 className="panel-title">结算数据加载失败</h2><p className="error-text">{loadMessage || "请稍后重试。"}</p><button className="btn" type="button" onClick={() => window.location.reload()}>重新加载</button></section></AppLayout>;

  const result = settlement;
  const coverageBlocked = Boolean(result && !result.coverageComplete);
  const canConfirm = Boolean(result && access.isOwner && !coverageBlocked && !overlap && !exactBatch && !result.invalidRange && !result.unknownAttributions.length && !busy);
  if (coverageBlocked && result) return <AppLayout title="合伙结算"><section className="card panel"><h2 className="panel-title">无法开始结算</h2><div className="warning-text">所选结算期间存在未配置利润比例的日期：{result.uncoveredRanges.map((range) => `${range.startDate} 至 ${range.endDate}`).join("、") || `${activeRange.startDate} 至 ${activeRange.endDate}`}。请先调整该房源首个比例方案起始日。</div><a className="btn compact" href="/partners">进入合伙人管理</a></section></AppLayout>;
  return <AppLayout title="合伙结算" description="按房源、比例生效区间和真实收支归属生成动态合伙结算。">
    <section className="card panel settlement-controls">
      <div className="panel-header"><div><h2 className="panel-title">结算范围</h2><p className="muted">先选择单套房源和日期，再点击“开始试算”。</p></div><a className="btn compact" href="/partner-settlements">结算历史</a></div>
      <div className="filter-grid">
        <div className="field"><label>房源</label><select value={propertyId} onChange={(event) => changeProperty(event.target.value)}>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></div>
        <div className="field"><label>时间范围</label><select value={rangeMode} onChange={(event) => changeRangeMode(event.target.value as RangeMode)}><option value="previous">上一个完整月份</option><option value="threeMonths">近3个月</option><option value="custom">自定义</option></select></div>
        {rangeMode === "custom" ? <><div className="field"><label>开始日期</label><input type="date" value={customStartDate} onChange={(event) => changeCustomStart(event.target.value)} /></div><div className="field"><label>结束日期</label><input type="date" value={customEndDate} onChange={(event) => changeCustomEnd(event.target.value)} /></div></> : null}
      </div>
      <p className="muted">实际范围：{activeRange.startDate} 至 {activeRange.endDate}</p>
      <div className="button-row"><button className="btn primary" type="button" onClick={startTrial}>开始试算</button><button className="btn" type="button" onClick={resetFilters}>重置</button></div>
      {message ? <p className={message.includes("失败") || message.includes("不得") ? "error-text" : "success-text"}>{message}</p> : null}
      {exactBatch ? <div className="success-text">已结算：确认时间 {new Date(exactBatch.confirmed_at).toLocaleString("zh-CN")}。<a href={`/partner-settlements/${exactBatch.id}`}>查看结算快照</a></div> : null}
      {overlap && !exactBatch ? <div className="warning-text">所选时间段与已结算记录重叠，请调整日期后重试。<a href={`/partner-settlements/${overlap.id}`}>查看重叠快照</a></div> : null}
    </section>

    {!result ? <section className="card panel"><p className="muted">请选择条件并点击“开始试算”后查看结算结果。</p></section> : <>
      <section className="card compact-report-card"><CompactMetric label="总收入" value={euro(result.totalIncome)} /><CompactMetric label="总支出" value={euro(result.totalExpense)} /><CompactMetric label="净利润" value={euro(result.netProfit)} tone={result.netProfit < 0 ? "danger" : "profit"} /><CompactMetric label="比例分段" value={`${result.segments.length} 段`} /></section>
      {result.totalIncome === 0 && result.totalExpense === 0 ? <p className="muted">该时间段暂无收入和支出记录。</p> : null}
      {result.unknownAttributions.length ? <div className="warning-text">存在无法识别归属的历史账目，当前只能试算，不能确认。</div> : null}
      <section className="card panel"><div className="panel-header"><div><h2 className="panel-title">动态合伙结算</h2><p className="muted">{properties.find((property) => property.id === propertyId)?.name} · {activeRange.startDate} 至 {activeRange.endDate}</p></div>{canConfirm ? <button className="btn primary" type="button" onClick={() => void confirmSettlement()}>确认已结算</button> : null}</div><div className="settlement-segment-list">{result.segments.map((segment) => <div className="settlement-history-row" key={`${segment.startDate}-${segment.endDate}`}><strong>{segment.startDate} 至 {segment.endDate}</strong><span>{segment.shares.map((share) => `${result.partners.find((partner) => partner.partnerId === share.partnerId)?.displayName || "未知"} ${share.percentage}%`).join("、")}</span><span>收入 {euro(segment.income)}</span><span>支出 {euro(segment.expense)}</span><span>净利润 {euro(segment.netProfit)}</span></div>)}</div><div className="settlement-grid compact-settlement-grid">{result.partners.filter((partner) => partner.collected || partner.advanced || partner.profitEntitlement || partner.balance || result.segments.some((segment) => segment.shares.some((share) => share.partnerId === partner.partnerId))).map((partner) => <article className="settlement-card" key={partner.partnerId}><div className="profit-card-head"><div><strong>{partner.displayName}</strong><p>{partner.legacyCode ? `兼容代码 ${partner.legacyCode}` : "动态合伙人"}</p></div><StatusBadge tone={partner.balance > 0 ? "amber" : partner.balance < 0 ? "blue" : "green"}>{partner.balance > 0 ? "应付" : partner.balance < 0 ? "应收" : "已平衡"}</StatusBadge></div><div className="profit-card-metrics"><span>代收 <b>{euro(partner.collected)}</b></span><span>垫付 <b>{euro(partner.advanced)}</b></span><span>实际留存 <b>{euro(partner.actualRetained)}</b></span><span>应得利润 <b>{euro(partner.profitEntitlement)}</b></span><span>结算余额 <b>{euro(partner.balance)}</b></span></div></article>)}</div>{result.transfers.length ? <div className="settlement-result"><h3>转账建议</h3>{result.transfers.map((transfer) => <p key={`${transfer.fromPartnerId}-${transfer.toPartnerId}`}><strong>{result.partners.find((partner) => partner.partnerId === transfer.fromPartnerId)?.displayName}</strong> 转给 <strong>{result.partners.find((partner) => partner.partnerId === transfer.toPartnerId)?.displayName}</strong> <span className="danger-text">{euro(transfer.amount)}</span></p>)}</div> : <p className="muted">当前无需互相转账。</p>}</section>
      <div className="grid dashboard-panels"><CompactDetailList title="收入归属明细" rows={payments.filter((payment) => inRange(paymentAccountingDate(payment), activeRange) && payment.propertyId === propertyId && !isVoided(payment.notes)).map((payment) => ({ id: `income-${payment.id}`, date: paymentAccountingDate(payment), partner: displayPartner(payment.receivedBy, partnerData?.partners || []), type: payment.incomeItem || payment.incomeType || "租金收入", amount: rentIncomeForPayment(payment) }))} /><CompactDetailList title="支出归属明细" rows={expenses.filter((expense) => inRange(expense.paymentDate || `${expense.expenseMonth}-01`, activeRange) && expense.propertyId === propertyId && !isVoided(expense.notes)).map((expense) => ({ id: `expense-${expense.id}`, date: expense.paymentDate || expense.expenseMonth, partner: displayPartner(expense.paidBy, partnerData?.partners || []), type: expense.category, amount: Number(expense.amount || 0) }))} /></div>
    </>}
  </AppLayout>;
}

function AuthExpiredState() { return <AppLayout title="登录已失效"><section className="card panel auth-expired-state"><h2 className="panel-title">登录已失效</h2><p className="muted">请重新登录后继续查看和确认合伙结算。</p><a className="btn primary" href={`/login?returnTo=${encodeURIComponent("/partnership-settlement")}`}>重新登录</a></section></AppLayout>; }
function CompactMetric({ label, value, tone }: { label: string; value: string; tone?: "danger" | "profit" }) { return <div className="compact-report-metric"><span>{label}</span><strong className={tone === "danger" ? "danger-text" : tone === "profit" ? "profit" : ""}>{value}</strong></div>; }
function CompactDetailList({ title, rows }: { title: string; rows: Array<{ id: string; date: string; partner: string; type: string; amount: number }> }) { return <section className="card panel"><h2 className="panel-title">{title}</h2><div className="settlement-detail-list">{rows.map((row) => <div className="settlement-detail-line" key={row.id}><span>{row.date}</span><b>{row.partner}</b><span>{row.type}</span><strong>{euro(row.amount)}</strong></div>)}{!rows.length ? <p className="muted">暂无明细</p> : null}</div></section>; }
function displayPartner(value: string | undefined, partners: PartnerWorkspaceData["partners"]) { const partner = partners.find((item) => item.id === value || item.displayName === value || (item.legacyCode || "").toUpperCase() === (value || "").toUpperCase()); return partner?.displayName || value || "未分配"; }
function isVoided(notes?: string) { return Boolean(notes?.includes("[已作废]") || notes?.toLowerCase().includes("[void]")); }
function inRange(value: string | null | undefined, range: { startDate: string; endDate: string }) { return Boolean(value && value >= range.startDate && value <= range.endDate); }
function presetRange(mode: RangeMode) { const today = new Date(); const year = today.getFullYear(); const month = today.getMonth(); if (mode === "threeMonths") return { startDate: formatDate(new Date(year, month - 2, 1)), endDate: formatDate(today) }; return { startDate: formatDate(new Date(year, month - 1, 1)), endDate: formatDate(new Date(year, month, 0)) }; }
function formatDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
