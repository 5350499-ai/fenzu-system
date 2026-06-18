"use client";

import { AppLayout } from "@/components/app-layout";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessDeposit,
  BusinessExpense,
  BusinessProperty,
  BusinessRentPayment,
  depositKey,
  expenseKey,
  getInitialDeposits,
  getInitialExpenses,
  getInitialProperties,
  getInitialRentPayments,
  loadBusinessData,
  propertyKey,
  rentPaymentKey
} from "@/lib/business-data";
import { euro } from "@/lib/format";
import { isLinkedRentDeposit, rentIncomeForPayment } from "@/lib/profit";
import { defaultPartnerRatios, loadPartnerRatios, partnerClass, partnerLabel, PartnerRatios } from "@/lib/partner-settings";
import { useEffect, useMemo, useState } from "react";

const partners = ["A", "B"];

type PartnerStat = {
  collected: number;
  advanced: number;
  actualCash: number;
  shouldHave: number;
  balance: number;
};

export default function PartnershipSettlementPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [propertyId, setPropertyId] = useState("all");
  const [ratios, setRatios] = useState<PartnerRatios>(defaultPartnerRatios);

  useEffect(() => {
    setRatios(loadPartnerRatios());
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      setProperties(loadedProperties);
      setPayments(await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments()));
      setExpenses(await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties)));
      setDeposits(await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits()));
    }
    load().catch((error) => window.alert(`加载合伙结算失败：${error.message || error}`));
  }, []);

  const settlement = useMemo(() => {
    const scopedPayments = payments.filter((payment) =>
      payment.rentMonth === month &&
      (propertyId === "all" || payment.propertyId === propertyId) &&
      !isVoided(payment.notes)
    );
    const scopedExpenses = expenses.filter((expense) =>
      (expense.expenseMonth === month || expense.paymentDate.startsWith(month)) &&
      (propertyId === "all" || expense.propertyId === propertyId) &&
      !isVoided(expense.notes)
    );
    const scopedDeposits = deposits.filter((deposit) =>
      deposit.transactionDate.startsWith(month) &&
      (propertyId === "all" || deposit.propertyId === propertyId) &&
      deposit.status !== "已作废" &&
      !isVoided(deposit.notes)
    );

    const standaloneDepositIncome = scopedDeposits.filter((deposit) => deposit.type === "收取" && !isLinkedRentDeposit(deposit));
    const depositRefunds = scopedDeposits.filter((deposit) => deposit.type === "退还");
    const totalIncome = scopedPayments.reduce((sum, payment) => sum + rentIncomeForPayment(payment, deposits), 0)
      + standaloneDepositIncome.reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);
    const totalExpense = scopedExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
      + depositRefunds.reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);
    const netProfit = totalIncome - totalExpense;
    const customCollected = scopedPayments
      .filter((payment) => !partners.includes(normalizePartner(payment.receivedBy)))
      .reduce((sum, payment) => sum + rentIncomeForPayment(payment, deposits), 0)
      + standaloneDepositIncome
        .filter((deposit) => !partners.includes(normalizePartner(deposit.receivedBy)))
        .reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);

    const partnerStats = partners.reduce<Record<string, PartnerStat>>((map, partner) => {
      const collected = scopedPayments
        .filter((payment) => normalizePartner(payment.receivedBy) === partner)
        .reduce((sum, payment) => sum + rentIncomeForPayment(payment, deposits), 0)
        + standaloneDepositIncome
          .filter((deposit) => normalizePartner(deposit.receivedBy) === partner)
          .reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);
      const advanced = scopedExpenses
        .filter((expense) => normalizePartner(expense.paidBy) === partner)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
        + depositRefunds
          .filter((deposit) => normalizePartner(deposit.paidBy) === partner)
          .reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);
      const actualCash = collected - advanced;
      map[partner] = {
        collected,
        advanced,
        actualCash,
        shouldHave: netProfit * (ratios[partner as keyof PartnerRatios] / 100),
        balance: actualCash - netProfit * (ratios[partner as keyof PartnerRatios] / 100)
      };
      return map;
    }, {});

    const aBalance = partnerStats.A.balance;
    const transfer =
      Math.abs(aBalance) < 0.005
        ? { from: "", to: "", amount: 0 }
        : aBalance > 0
          ? { from: "A", to: "B", amount: aBalance }
          : { from: "B", to: "A", amount: Math.abs(aBalance) };

    return { scopedPayments, scopedExpenses, scopedDeposits, totalIncome, totalExpense, netProfit, customCollected, partnerStats, transfer };
  }, [deposits, expenses, month, payments, propertyId, ratios]);

  return (
    <AppLayout title="合伙结算" description="按 A/B 代收和垫付自动计算月底谁该给谁转账。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">结算范围</h2>
            <p className="muted">当前比例：A {ratios.A}% / B {ratios.B}%。可在设置里调整。</p>
          </div>
        </div>
        <div className="filter-grid">
          <div className="field">
            <label>月份</label>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </div>
          <div className="field">
            <label>房源</label>
            <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
              <option value="all">全部房源</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="card compact-report-card">
        <CompactMetric label="总收入" value={euro(settlement.totalIncome)} />
        <CompactMetric label="总支出" value={euro(settlement.totalExpense)} />
        <CompactMetric label="净利润" value={euro(settlement.netProfit)} tone={settlement.netProfit < 0 ? "danger" : "profit"} />
        <CompactMetric label="A应得" value={euro(settlement.partnerStats.A.shouldHave)} />
        <CompactMetric label="B应得" value={euro(settlement.partnerStats.B.shouldHave)} />
      </section>

      <section className="card panel">
        <div className="panel-header">
          <h2 className="panel-title">A/B 资金归属</h2>
          <span className="muted">实际留存 = 代收 - 垫付</span>
        </div>
        <div className="settlement-grid compact-settlement-grid">
          {partners.map((partner) => {
            const stat = settlement.partnerStats[partner];
            return (
              <article className="settlement-card" key={partner}>
                <div className="profit-card-head">
                  <div>
                    <strong>{partner}</strong>
                    <p>结算代码 {partner}</p>
                  </div>
                  <StatusBadge tone={stat.balance > 0 ? "amber" : stat.balance < 0 ? "blue" : "green"}>{stat.balance > 0 ? "需转出" : stat.balance < 0 ? "应收回" : "已平衡"}</StatusBadge>
                </div>
                <div className="profit-card-metrics">
                  <span>代收 <b>{euro(stat.collected)}</b></span>
                  <span>垫付 <b>{euro(stat.advanced)}</b></span>
                  <span>实际留存 <b>{euro(stat.actualCash)}</b></span>
                  <span>应得利润 <b>{euro(stat.shouldHave)}</b></span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card panel settlement-result compact-settlement-result">
        <h2 className="panel-title">最终结算</h2>
        {settlement.customCollected > 0 ? (
          <p className="warning-text">存在自定义归属代收 {euro(settlement.customCollected)}，请确认实际持款人后再进行A/B最终转账。</p>
        ) : settlement.transfer.amount > 0 ? (
          <p><strong>{settlement.transfer.from}</strong> 应转给 <strong>{settlement.transfer.to}</strong> <span className="danger-text">{euro(settlement.transfer.amount)}</span></p>
        ) : (
          <p><span className="profit">A/B 当前无需互相转账。</span></p>
        )}
      </section>

      <div className="grid dashboard-panels">
        <CompactDetailList
          title="收入归属明细"
          rows={settlement.scopedPayments.map((payment) => ({
            id: `income-${payment.id}`,
            date: payment.paymentDate || payment.rentMonth,
            partner: payment.receivedBy || "A",
            type: payment.incomeItem || payment.incomeType || "房租收入",
            amount: rentIncomeForPayment(payment, deposits),
            details: [`类型：${payment.incomeType || "房租收入"}`, ...(payment.incomeType === "房租收入" || payment.incomeType === "续交房租" || !payment.incomeType ? [`覆盖：${payment.coverageStartDate || "-"} 至 ${payment.coverageEndDate || "-"}`, `月租参考：${euro(payment.amountDue)}`] : []), `收款状态：${payment.paymentStatus || "-"}`, `备注：${payment.notes || "-"}`]
          }))}
        />
        <CompactDetailList
          title="支出归属明细"
          rows={settlement.scopedExpenses.map((expense) => ({
            id: `expense-${expense.id}`,
            date: expense.paymentDate || expense.expenseMonth,
            partner: expense.paidBy || "A",
            type: expense.category,
            amount: expense.amount,
            details: [`状态：${expense.isPaid ? "已支付" : "未支付"}`, `方式：${expense.paymentMethod || "-"}`, `备注：${expense.notes || "-"}`]
          }))}
        />
        <CompactDetailList
          title="押金/预收预支归属明细"
          rows={settlement.scopedDeposits.map((deposit) => ({
            id: `deposit-${deposit.id}`,
            date: deposit.transactionDate || "-",
            partner: deposit.type === "退还" || deposit.type === "扣除" ? deposit.paidBy || "A" : deposit.receivedBy || "A",
            type: deposit.type,
            amount: deposit.amount,
            details: [`状态：${deposit.status}`, `收款归属：${deposit.receivedBy || "A"}`, `付款归属：${deposit.paidBy || "A"}`, `备注：${deposit.notes || "-"}`]
          }))}
        />
      </div>
    </AppLayout>
  );
}

function CompactMetric({ label, value, tone }: { label: string; value: string; tone?: "danger" | "profit" }) {
  return (
    <div className="compact-report-metric">
      <span>{label}</span>
      <strong className={tone === "danger" ? "danger-text" : tone === "profit" ? "profit" : ""}>{value}</strong>
    </div>
  );
}

function CompactDetailList({
  title,
  rows
}: {
  title: string;
  rows: { id: string; date: string; partner: string; type: string; amount: number; details: string[] }[];
}) {
  const [expandedId, setExpandedId] = useState("");
  return (
    <section className="card panel">
      <h2 className="panel-title">{title}</h2>
      <div className="settlement-detail-list">
        {rows.map((row) => {
          const expanded = expandedId === row.id;
          return (
            <article className="settlement-detail-item" key={row.id}>
              <button className="settlement-detail-line" onClick={() => setExpandedId(expanded ? "" : row.id)} type="button">
                <span>{row.date}</span>
                <b className={`partner-tag ${partnerClass(row.partner)}`}>{partnerLabel(row.partner)}</b>
                <span>{row.type}</span>
                <strong>{euro(row.amount)}</strong>
              </button>
              {expanded ? (
                <div className="settlement-detail-extra">
                  {row.details.map((detail) => <span key={detail}>{detail}</span>)}
                </div>
              ) : null}
            </article>
          );
        })}
        {!rows.length ? <p className="muted">暂无明细。</p> : null}
      </div>
    </section>
  );
}

function normalizePartner(value?: string) {
  const partner = (value || "A").trim().toUpperCase();
  return partners.includes(partner) ? partner : "";
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.includes("[宸蹭綔搴焆"));
}
