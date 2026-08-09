"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { StatusBadge } from "@/components/status-badge";
import { BusinessExpense, BusinessProperty, BusinessRentPayment, expenseKey, getInitialExpenses, getInitialProperties, getInitialRentPayments, refreshBusinessData, propertyKey, rentPaymentKey } from "@/lib/business-data";
import { buildSettlement, countEffectiveSettlementBatches, SettlementResult } from "@/lib/partner-settlement";
import { refreshPartners, PartnerWorkspaceData } from "@/lib/partners";
import { getValidSupabaseSession } from "@/lib/supabase";
import { euro } from "@/lib/format";
import { isMonthInRange, paymentAccountingDate, rentIncomeForPayment } from "@/lib/profit";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cacheManager } from "@/lib/cache/cache-manager";
import { PARTNER_SETTLEMENT_CACHE_KEY } from "@/lib/cache/cache-keys";
import { DetailCard, DetailGrid, DetailItem, MoneyValue } from "@/components/ui";
import { PropertyMultiSelect } from "@/components/property-multi-select";

type RangeMode = "previous" | "threeMonths" | "custom";
type Batch = { id: string; property_id: string; period_start: string; period_end: string; status: "confirmed" | "reversed"; total_income: number; total_expense: number; net_profit: number; confirmed_at: string; confirmed_by_account_id: string | null };
type LoadState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";
type SettlementSnapshot = { properties: BusinessProperty[]; payments: BusinessRentPayment[]; expenses: BusinessExpense[]; partnerData: PartnerWorkspaceData; batches: Batch[] };

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
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [rangeMode, setRangeMode] = useState<RangeMode>("previous");
  const [customStartDate, setCustomStartDate] = useState(defaultRange.startDate);
  const [customEndDate, setCustomEndDate] = useState(defaultRange.endDate);
  const [trialKey, setTrialKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const activeRange = useMemo(() => rangeMode === "custom" ? { startDate: customStartDate, endDate: customEndDate } : presetRange(rangeMode), [customEndDate, customStartDate, rangeMode]);
  const currentKey = `${selectedPropertyIds.join(",")}|${activeRange.startDate}|${activeRange.endDate}`;
  const settlement = useMemo<SettlementResult | null>(() => {
    if (!trialKey || trialKey !== currentKey || !partnerData || !selectedPropertyIds.length) return null;
    return buildSettlement(selectedPropertyIds, activeRange, properties, partnerData.partners, partnerData.shares, payments, expenses, partnerData.accountAlias);
  }, [activeRange, currentKey, expenses, partnerData, payments, properties, selectedPropertyIds, trialKey]);
  const effectiveSettlementCount = countEffectiveSettlementBatches(batches);
  const overlap = useMemo(() => settlement ? batches.find((batch) => batch.status === "confirmed" && selectedPropertyIds.includes(batch.property_id) && batch.period_start <= activeRange.endDate && batch.period_end >= activeRange.startDate) || null : null, [activeRange, batches, selectedPropertyIds, settlement]);
  const exactBatch = useMemo(() => selectedPropertyIds.length === 1 && settlement ? batches.find((batch) => batch.status === "confirmed" && batch.property_id === selectedPropertyIds[0] && batch.period_start === activeRange.startDate && batch.period_end === activeRange.endDate) || null : null, [activeRange, batches, selectedPropertyIds, settlement]);

  useEffect(() => {
    if (!access.ready) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const cachedSnapshot = access.userId ? cacheManager.peekMemory<SettlementSnapshot>(PARTNER_SETTLEMENT_CACHE_KEY, access.userId) : null;
      if (cachedSnapshot) {
      setProperties(cachedSnapshot.properties); setPayments(cachedSnapshot.payments); setExpenses(cachedSnapshot.expenses); setPartnerData(cachedSnapshot.partnerData); setBatches(cachedSnapshot.batches); setSelectedPropertyIds((current) => current.length ? current : cachedSnapshot.properties.map((property) => property.id)); setLoadState("ready");
      unsubscribe = cacheManager.subscribe(access.userId, PARTNER_SETTLEMENT_CACHE_KEY, () => {
        const next = cacheManager.peekMemory<SettlementSnapshot>(PARTNER_SETTLEMENT_CACHE_KEY, access.userId);
        if (next && !cancelled) { setProperties(next.properties); setPayments(next.payments); setExpenses(next.expenses); setPartnerData(next.partnerData); setBatches(next.batches); setLoadState("ready"); }
      });
    }
    async function load() {
      if (!cachedSnapshot) setLoadState("loading"); setLoadMessage("");
      try {
        const session = await getValidSupabaseSession();
        if (!session) throw new SettlementPageError("登录已失效，请重新登录。", "unauthorized");
        const headers = { Authorization: `Bearer ${session.access_token}` };
        const [loadedProperties, loadedPayments, loadedExpenses, partnerPayload, batchPayload] = await Promise.all([
          access.can("properties") ? refreshBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : Promise.resolve([]),
          access.can("rent_payments") ? refreshBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments()) : Promise.resolve([]),
          access.can("expenses") ? refreshBusinessData<BusinessExpense>(expenseKey, getInitialExpenses()) : Promise.resolve([]),
          refreshPartners(),
          fetch("/api/partner-settlements", { headers, cache: "no-store" }).then(readApi)
        ]);
        if (!loadedProperties.length) throw new SettlementPageError("当前工作区没有可用房源。", "no_data");
        if (!cancelled) {
          setProperties(loadedProperties); setSelectedPropertyIds((current) => current.length ? current.filter((id) => loadedProperties.some((property) => property.id === id)) : loadedProperties.map((property) => property.id)); setPayments(loadedPayments); setExpenses(loadedExpenses); setPartnerData(partnerPayload); setBatches(batchPayload.batches || []); setLoadState("ready");
          void cacheManager.set(PARTNER_SETTLEMENT_CACHE_KEY, { properties: loadedProperties, payments: loadedPayments, expenses: loadedExpenses, partnerData: partnerPayload, batches: batchPayload.batches || [] }, session.user.id);
        }
      } catch (error) {
        if (cancelled) return;
        const code = error instanceof SettlementPageError ? error.code : error instanceof Error && error.message.includes("登录") ? "unauthorized" : "load_failed";
        setLoadState(code === "unauthorized" ? "unauthorized" : code === "forbidden" ? "forbidden" : "error"); setLoadMessage(error instanceof Error ? error.message : "加载结算数据失败，请稍后重试。");
      }
    }
    void load();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [access.ready, access.permissionVersion, access.userId]);

  function invalidateTrial() { setTrialKey(""); setMessage(""); }
  function changeProperty(value: string[]) { setSelectedPropertyIds(value); invalidateTrial(); }
  function changeRangeMode(value: RangeMode) { setRangeMode(value); invalidateTrial(); }
  function changeCustomStart(value: string) { setCustomStartDate(value); invalidateTrial(); }
  function changeCustomEnd(value: string) { setCustomEndDate(value); invalidateTrial(); }
  function startTrial() {
    if (!selectedPropertyIds.length || !activeRange.startDate || !activeRange.endDate) { setMessage("请选择至少一个房源、开始日期和结束日期。"); return; }
    if (activeRange.startDate > activeRange.endDate) { setMessage("开始日期不得晚于结束日期。"); return; }
    setMessage(""); setTrialKey(currentKey);
  }
  function resetFilters() { const next = presetRange("previous"); setRangeMode("previous"); setCustomStartDate(next.startDate); setCustomEndDate(next.endDate); setTrialKey(""); setMessage(""); }

  async function confirmSettlement() {
    if (!settlement || !selectedPropertyIds.length || overlap || exactBatch || settlement.unknownAttributions.length || settlement.invalidRange) return;
    const propertyNames = selectedPropertyIds.map((id) => properties.find((property) => property.id === id)?.name || id).join("、");
    const perProperty = selectedPropertyIds.map((id) => ({ id, result: buildSettlement([id], activeRange, properties, partnerData!.partners, partnerData!.shares, payments, expenses, partnerData!.accountAlias) }));
    if (perProperty.some((item) => !item.result.coverageComplete || item.result.unknownAttributions.length)) { setMessage("所选房源中存在未完成的比例方案或无法识别归属，暂不能确认结算。"); return; }
    if (!window.confirm(`确认保存所选房源的结算快照吗？\n\n房源：${propertyNames}\n期间：${activeRange.startDate} 至 ${activeRange.endDate}\n总收入：${euro(settlement.totalIncome)}\n总支出：${euro(settlement.totalExpense)}\n净利润：${euro(settlement.netProfit)}\n\n确认后不会修改原始账目。`)) return;
    setBusy(true); setMessage("");
    try {
      const session = await getValidSupabaseSession();
      if (!session) throw new SettlementPageError("登录已失效，请重新登录。", "unauthorized");
      const createdBatches: Batch[] = [];
      for (const propertyId of selectedPropertyIds) {
        const propertySettlement = perProperty.find((item) => item.id === propertyId)!.result;
        const response = await fetch("/api/partner-settlements", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ propertyId, startDate: activeRange.startDate, endDate: activeRange.endDate }) });
        const payload = await readApi(response);
        createdBatches.push({ id: payload.batchId, property_id: propertyId, period_start: activeRange.startDate, period_end: activeRange.endDate, status: "confirmed", total_income: propertySettlement.totalIncome, total_expense: propertySettlement.totalExpense, net_profit: propertySettlement.netProfit, confirmed_at: new Date().toISOString(), confirmed_by_account_id: null });
      }
      setMessage("结算快照已保存");
      setBatches((current) => [...current, ...createdBatches]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "结算确认失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  if (loadState === "loading") return <AppLayout title="合伙结算"><section className="card panel"><p className="muted">正在加载结算数据…</p></section></AppLayout>;
  if (loadState === "unauthorized") return <AuthExpiredState />;
  if (loadState === "forbidden") return <AppLayout title="合伙结算"><section className="card panel"><h2 className="panel-title">没有访问权限</h2><p className="muted">当前账号没有查看合伙结算的权限。</p></section></AppLayout>;
  if (loadState === "error") return <AppLayout title="合伙结算"><section className="card panel"><h2 className="panel-title">结算数据加载失败</h2><p className="error-text">{loadMessage || "请稍后重试。"}</p><button className="btn" type="button" onClick={() => window.location.reload()}>重新加载</button></section></AppLayout>;

  const result = settlement;
  const propertyId = selectedPropertyIds.length === 1 ? selectedPropertyIds[0] : "";
  const coverageBlocked = Boolean(result && !result.coverageComplete);
  const canConfirm = Boolean(result && selectedPropertyIds.length > 0 && access.isOwner && !coverageBlocked && !overlap && !exactBatch && !result.invalidRange && !result.unknownAttributions.length && !busy);
  if (coverageBlocked && result) return <AppLayout title="合伙结算"><section className="card panel"><h2 className="panel-title">无法开始结算</h2><div className="warning-text">所选结算期间存在未配置利润比例的日期：{result.uncoveredRanges.map((range) => `${range.startDate} 至 ${range.endDate}`).join("、") || `${activeRange.startDate} 至 ${activeRange.endDate}`}。请先调整该房源首个比例方案起始日。</div><a className="btn compact" href="/partners">进入合伙人管理</a></section></AppLayout>;
  return <AppLayout title="合伙结算" description="按房源、比例生效区间和真实收支归属生成动态合伙结算。">
    <section className="card panel settlement-controls">
      <div className="panel-header"><div><h2 className="panel-title">结算范围</h2><p className="muted">先选择单套房源和日期，再点击“开始试算”。</p></div><a className="btn compact" href="/partner-settlements">结算历史</a></div>
      <div className="filter-grid">
        <PropertyMultiSelect properties={properties} selectedIds={selectedPropertyIds} onChange={changeProperty} />
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
      <section className="card compact-report-card"><CompactMetric label="总收入" value={euro(result.totalIncome)} /><CompactMetric label="总支出" value={euro(result.totalExpense)} /><CompactMetric label="净利润" value={euro(result.netProfit)} tone={result.netProfit < 0 ? "danger" : "profit"} /><CompactMetric label="结算次数" count={effectiveSettlementCount} href="/partner-settlements" /></section>
      {result.totalIncome === 0 && result.totalExpense === 0 ? <p className="muted">该时间段暂无收入和支出记录。</p> : null}
      {result.unknownAttributions.length ? <div className="warning-text">存在无法识别归属的历史账目，当前只能试算，不能确认。</div> : null}
      <section className="card panel"><div className="panel-header"><div><h2 className="panel-title">动态合伙结算</h2><p className="muted">{properties.find((property) => property.id === propertyId)?.name} · {activeRange.startDate} 至 {activeRange.endDate}</p></div>{canConfirm ? <button className="btn primary" type="button" onClick={() => void confirmSettlement()}>确认结算</button> : null}</div><div className="settlement-segment-list">{result.segments.map((segment, index) => <DetailCard className="settlement-segment-card" key={`${segment.startDate}-${segment.endDate}`} title={`比例分段 ${index + 1}`} subtitle={`${segment.startDate} ～ ${segment.endDate}`}><div className="settlement-share-list">{segment.shares.map((share) => <span key={share.partnerId}>{result.partners.find((partner) => partner.partnerId === share.partnerId)?.displayName || "未知"}（{share.percentage}%）</span>)}</div><DetailGrid><DetailItem label="收入" value={<MoneyValue value={segment.income} tone="income" />} tone="income" /><DetailItem label="支出" value={<MoneyValue value={segment.expense} tone="expense" />} tone="expense" /><DetailItem label="净利润" value={<MoneyValue value={segment.netProfit} tone={segment.netProfit < 0 ? "loss" : "profit"} />} tone={segment.netProfit < 0 ? "loss" : "profit"} /></DetailGrid></DetailCard>)}</div><div className="settlement-grid compact-settlement-grid">{result.partners.filter((partner) => partner.collected || partner.advanced || partner.profitEntitlement || partner.balance || result.segments.some((segment) => segment.shares.some((share) => share.partnerId === partner.partnerId))).map((partner) => <article className="settlement-card partner-settlement-card" key={partner.partnerId}><div className="profit-card-head"><div><strong>{partner.displayName}</strong></div><span className="settlement-balance-badge"><StatusBadge tone={partner.balance > 0 ? "amber" : partner.balance < 0 ? "blue" : "green"}>{partner.balance > 0 ? "应付" : partner.balance < 0 ? "应收" : "已平衡"}</StatusBadge></span></div><div className="profit-card-metrics"><span><label>代收</label><b>{euro(partner.collected)}</b></span><span><label>垫付</label><b>{euro(partner.advanced)}</b></span><span><label>实际留存</label><b>{euro(partner.actualRetained)}</b></span><span><label>应得利润</label><b>{euro(partner.profitEntitlement)}</b></span></div><div className="partner-settlement-balance"><span>结算余额</span><strong className={partner.balance < 0 ? "profit" : partner.balance > 0 ? "danger-text" : "muted"}>{euro(partner.balance)}</strong></div></article>)}</div>{result.transfers.length ? <DetailCard className="settlement-transfer-card" title="最终转账建议">{result.transfers.map((transfer) => <p key={`${transfer.fromPartnerId}-${transfer.toPartnerId}`}><strong>{result.partners.find((partner) => partner.partnerId === transfer.fromPartnerId)?.displayName}</strong> 转给 <strong>{result.partners.find((partner) => partner.partnerId === transfer.toPartnerId)?.displayName}</strong> <MoneyValue value={transfer.amount} tone="loss" /></p>)}</DetailCard> : <p className="muted">当前无需互相转账。</p>}</section>
      <div className="grid dashboard-panels"><CompactDetailList title="收入归属明细" rows={payments.filter((payment) => inRange(paymentAccountingDate(payment), activeRange) && selectedPropertyIds.includes(payment.propertyId) && !isVoided(payment.notes)).map((payment) => ({ id: `income-${payment.id}`, date: paymentAccountingDate(payment), partner: displayPartner(payment.receivedBy, partnerData?.partners || [], partnerData?.accountAlias), type: payment.incomeItem || payment.incomeType || "租金收入", amount: rentIncomeForPayment(payment) }))} /><CompactDetailList title="支出归属明细" rows={expenses.filter((expense) => inRange(expense.paymentDate || `${expense.expenseMonth}-01`, activeRange) && selectedPropertyIds.includes(expense.propertyId) && !isVoided(expense.notes)).map((expense) => ({ id: `expense-${expense.id}`, date: expense.paymentDate || expense.expenseMonth, partner: displayPartner(expense.paidBy, partnerData?.partners || [], partnerData?.accountAlias), type: expense.category, amount: Number(expense.amount || 0) }))} /></div>
    </>}
  </AppLayout>;
}

function AuthExpiredState() { return <AppLayout title="登录已失效"><section className="card panel auth-expired-state"><h2 className="panel-title">登录已失效</h2><p className="muted">请重新登录后继续查看和确认合伙结算。</p><a className="btn primary" href={`/login?returnTo=${encodeURIComponent("/partnership-settlement")}`}>重新登录</a></section></AppLayout>; }
function CompactMetric({ label, value, count, tone, href }: { label: string; value?: string; count?: number; tone?: "danger" | "profit"; href?: string }) { const content = <><span>{label}</span>{typeof count === "number" ? <strong className="settlement-count-value"><b>{count}</b><small>次</small>{count === 0 ? <em>（首次结算前）</em> : null}</strong> : <strong className={tone === "danger" ? "danger-text" : tone === "profit" ? "profit" : ""}>{value}</strong>}</>; return href ? <Link className="compact-report-metric compact-report-metric--link" href={href}>{content}</Link> : <div className="compact-report-metric">{content}</div>; }
function CompactDetailList({ title, rows }: { title: string; rows: Array<{ id: string; date: string; partner: string; type: string; amount: number }> }) { return <section className="card panel"><h2 className="panel-title">{title}</h2><div className="settlement-detail-list">{rows.map((row) => <div className="settlement-detail-line" key={row.id}><span>{row.date}</span><b>{row.partner}</b><span>{row.type}</span><MoneyValue value={row.amount} tone={title.includes("收入") ? "income" : "expense"} /> </div>)}{!rows.length ? <p className="muted">暂无明细</p> : null}</div></section>; }
function displayPartner(value: string | undefined, partners: PartnerWorkspaceData["partners"], accountAlias?: string | null) { const partner = partners.find((item) => item.id === value || item.displayName === value || (item.legacyCode || "").toUpperCase() === (value || "").toUpperCase()); if (partner) return partner.displayName; if (partners.length === 1 && (value === "本人" || value === accountAlias)) return partners[0].displayName; return value || "未分配"; }
function isVoided(notes?: string) { return Boolean(notes?.includes("[已作废]") || notes?.toLowerCase().includes("[void]")); }
function inRange(value: string | null | undefined, range: { startDate: string; endDate: string }) { return Boolean(value && value >= range.startDate && value <= range.endDate); }
function presetRange(mode: RangeMode) { const today = new Date(); const year = today.getFullYear(); const month = today.getMonth(); if (mode === "threeMonths") return { startDate: formatDate(new Date(year, month - 2, 1)), endDate: formatDate(today) }; return { startDate: formatDate(new Date(year, month - 1, 1)), endDate: formatDate(new Date(year, month, 0)) }; }
function formatDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
