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
  depositKey,
  expenseKey,
  getInitialDeposits,
  getInitialExpenses,
  getInitialProperties,
  getInitialRentPayments,
  getInitialRooms,
  loadBusinessData,
  propertyKey,
  rentPaymentKey,
  roomKey
} from "@/lib/business-data";
import { euro } from "@/lib/format";
import { calculatePropertyProfits, getDateRange, RangePreset, rangeOptions } from "@/lib/profit";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function PropertyProfitsPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
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
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments());
      const loadedExpenses = await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties));
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits());
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setPayments(loadedPayments);
      setExpenses(loadedExpenses);
      setDeposits(loadedDeposits);
    }
    load().catch((error) => window.alert(`加载房源利润失败：${error.message || error}`));
  }, []);

  const range = useMemo(() => getDateRange(preset, customStart, customEnd), [customEnd, customStart, preset]);
  const stats = useMemo(() => {
    return calculatePropertyProfits(properties, rooms, payments, expenses, deposits, range)
      .sort((a, b) => a.netProfit - b.netProfit);
  }, [deposits, expenses, payments, properties, range, rooms]);

  return (
    <AppLayout title="房源利润分析" description="按房源单独核算收入、支出、净利润、欠租、入住率和空置风险。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">筛选条件</h2>
            <p className="muted">当前范围：{range.start} 至 {range.end}</p>
          </div>
        </div>
        <div className="filter-grid">
          <SearchableSelect label="时间范围" value={preset} options={rangeOptions.map((item) => ({ value: item.value, label: item.label }))} onChange={(value) => setPreset(value as RangePreset)} />
          {preset === "custom" ? (
            <>
              <div className="field"><label>开始日期</label><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></div>
              <div className="field"><label>结束日期</label><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></div>
            </>
          ) : null}
        </div>
      </section>

      <section className="card panel">
        <div className="panel-header">
          <h2 className="panel-title">按房源统计</h2>
          <span className="muted">点击房源可进入详情页查看利润标签</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>房源名称</th>
                <th>本期收入</th>
                <th>本期支出</th>
                <th>本期净利润</th>
                <th>欠租金额</th>
                <th>入住率</th>
                <th>空置房间数</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => (
                <tr key={stat.property.id}>
                  <td><Link className="text-link" href={`/properties/${stat.property.id}`}>{stat.property.name}</Link></td>
                  <td>{euro(stat.income)}</td>
                  <td>{euro(stat.expense)}</td>
                  <td className={stat.netProfit < 0 ? "danger-text" : "profit"}>{euro(stat.netProfit)}</td>
                  <td className={stat.unpaid > 0 ? "danger-text" : ""}>{euro(stat.unpaid)}</td>
                  <td>{stat.occupancy}%</td>
                  <td>{stat.vacantRooms} 间</td>
                  <td><StatusBadge tone={stat.netProfit < 0 ? "red" : "green"}>{stat.netProfit < 0 ? "亏损" : "盈利"}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {stats.map((stat) => (
            <article className="mobile-record-card" key={stat.property.id}>
              <div className="mobile-record-title">
                <strong>{stat.property.name}</strong>
                <span><StatusBadge tone={stat.netProfit < 0 ? "red" : "green"}>{stat.netProfit < 0 ? "亏损" : "盈利"}</StatusBadge></span>
              </div>
              <div className="mobile-record-fields">
                <div className="mobile-record-field"><span>收入</span><strong>{euro(stat.income)}</strong></div>
                <div className="mobile-record-field"><span>支出</span><strong>{euro(stat.expense)}</strong></div>
                <div className="mobile-record-field"><span>净利润</span><strong className={stat.netProfit < 0 ? "danger-text" : "profit"}>{euro(stat.netProfit)}</strong></div>
                <div className="mobile-record-field"><span>欠租</span><strong className={stat.unpaid > 0 ? "danger-text" : ""}>{euro(stat.unpaid)}</strong></div>
                <div className="mobile-record-field"><span>入住率</span><strong>{stat.occupancy}%</strong></div>
                <div className="mobile-record-field"><span>空置</span><strong>{stat.vacantRooms} 间</strong></div>
              </div>
              <Link className="btn" href={`/properties/${stat.property.id}`}>进入房源详情</Link>
            </article>
          ))}
        </div>
      </section>
    </AppLayout>
  );
}
