"use client";

import { AppLayout } from "@/components/app-layout";
import { MetricCard } from "@/components/metric-card";
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
import { defaultPartnerRatios, loadPartnerRatios, PartnerRatios } from "@/lib/partner-settings";
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

    const totalIncome = scopedPayments.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
    const totalExpense = scopedExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const netProfit = totalIncome - totalExpense;

    const partnerStats = partners.reduce<Record<string, PartnerStat>>((map, partner) => {
      const collected = scopedPayments
        .filter((payment) => normalizePartner(payment.receivedBy) === partner)
        .reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
      const advanced = scopedExpenses
        .filter((expense) => normalizePartner(expense.paidBy) === partner)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
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

    return { scopedPayments, scopedExpenses, scopedDeposits, totalIncome, totalExpense, netProfit, partnerStats, transfer };
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

      <div className="grid metrics">
        <MetricCard label="总收入" value={euro(settlement.totalIncome)} note="本期已收租金" tone="profit" />
        <MetricCard label="总支出" value={euro(settlement.totalExpense)} note="本期支出合计" />
        <MetricCard label="净利润" value={euro(settlement.netProfit)} note="收入 - 支出" tone={settlement.netProfit < 0 ? "danger" : "profit"} hero />
        <MetricCard label="A应得利润" value={euro(settlement.partnerStats.A.shouldHave)} note={`按 ${ratios.A}% 计算`} tone={settlement.partnerStats.A.shouldHave < 0 ? "danger" : "info"} />
        <MetricCard label="B应得利润" value={euro(settlement.partnerStats.B.shouldHave)} note={`按 ${ratios.B}% 计算`} tone={settlement.partnerStats.B.shouldHave < 0 ? "danger" : "info"} />
      </div>

      <section className="card panel">
        <div className="panel-header">
          <h2 className="panel-title">A/B 资金归属</h2>
          <span className="muted">实际留存 = 代收 - 垫付</span>
        </div>
        <div className="settlement-grid">
          {partners.map((partner) => {
            const stat = settlement.partnerStats[partner];
            return (
              <article className="settlement-card" key={partner}>
                <div className="profit-card-head">
                  <div>
                    <strong>合伙人 {partner}</strong>
                    <p>代号结算，不记录真实姓名</p>
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

      <section className="card panel settlement-result">
        <h2 className="panel-title">最终结算</h2>
        {settlement.transfer.amount > 0 ? (
          <p><strong>{settlement.transfer.from}</strong> 应转给 <strong>{settlement.transfer.to}</strong> <span className="danger-text">{euro(settlement.transfer.amount)}</span></p>
        ) : (
          <p><span className="profit">A/B 当前无需互相转账。</span></p>
        )}
      </section>

      <div className="grid dashboard-panels">
        <DetailTable title="收入归属明细" headers={["月份", "收款归属", "金额"]}>
          {settlement.scopedPayments.map((payment) => <tr key={payment.id}><td>{payment.rentMonth}</td><td>{payment.receivedBy || "A"}</td><td>{euro(payment.amountPaid)}</td></tr>)}
        </DetailTable>
        <DetailTable title="支出归属明细" headers={["日期", "付款归属", "类别", "金额"]}>
          {settlement.scopedExpenses.map((expense) => <tr key={expense.id}><td>{expense.paymentDate || expense.expenseMonth}</td><td>{expense.paidBy || "A"}</td><td>{expense.category}</td><td>{euro(expense.amount)}</td></tr>)}
        </DetailTable>
        <DetailTable title="押金/预收预支归属明细" headers={["日期", "类型", "收款归属", "付款归属", "金额"]}>
          {settlement.scopedDeposits.map((deposit) => <tr key={deposit.id}><td>{deposit.transactionDate || "-"}</td><td>{deposit.type}</td><td>{deposit.receivedBy || "A"}</td><td>{deposit.paidBy || "A"}</td><td>{euro(deposit.amount)}</td></tr>)}
        </DetailTable>
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

function normalizePartner(value?: string) {
  const partner = (value || "A").trim().toUpperCase();
  return partners.includes(partner) ? partner : "A";
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.includes("[宸蹭綔搴焆"));
}
