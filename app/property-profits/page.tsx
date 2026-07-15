"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessDeposit,
  BusinessExpense,
  BusinessProperty,
  BusinessRentPayment,
  BusinessTenant,
  BusinessRoom,
  depositKey,
  expenseKey,
  getInitialDeposits,
  getInitialExpenses,
  getInitialProperties,
  getInitialTenants,
  getInitialRentPayments,
  getInitialRooms,
  loadBusinessData,
  propertyKey,
  rentPaymentKey,
  tenantKey,
  roomKey
} from "@/lib/business-data";
import { euro } from "@/lib/format";
import { calculatePropertyProfits, getDateRange } from "@/lib/profit";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function PropertyProfitsPage() {
  const access = useAccountAccess();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);

  useEffect(() => {
    if (!access.ready) return;
    async function load() {
      const loadedProperties = access.can("properties") ? await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : [];
      const loadedRooms = access.can("rooms") ? await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties)) : [];
      const loadedTenants = access.can("tenants") ? await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms)) : [];
      const loadedPayments = access.can("rent_payments") ? await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments()) : [];
      const loadedExpenses = access.can("expenses") ? await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties)) : [];
      const loadedDeposits = access.can("deposits") ? await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits()) : [];
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setPayments(loadedPayments);
      setExpenses(loadedExpenses);
      setDeposits(loadedDeposits);
    }
    load().catch((error) => window.alert(`加载房源利润失败：${error.message || error}`));
  }, [access.ready]);

  const stats = useMemo(() => {
    return calculatePropertyProfits(properties, rooms, tenants, payments, expenses, deposits, getDateRange("thisMonth"))
      .sort((a, b) => a.netProfit - b.netProfit);
  }, [deposits, expenses, payments, properties, rooms, tenants]);

  return (
    <AppLayout title="房源利润分析" description="每套房源单独核算，本页先看本月概览，点击房源进入明细。">
      <section className="card panel">
        <div className="panel-header">
          <h2 className="panel-title">按房源统计</h2>
          <span className="muted">默认显示本月</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>房源名称</th>
                <th>本月收入</th>
                <th>本月支出</th>
                <th>本月净利润</th>
                <th>欠租金额</th>
                <th>空置房间数</th>
                <th>入住率</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => (
                <tr key={stat.property.id}>
                  <td><Link className="text-link" href={`/property-profits/${stat.property.id}`}>{stat.property.name}</Link></td>
                  <td>{euro(stat.income)}</td>
                  <td>{euro(stat.expense)}</td>
                  <td className={stat.netProfit < 0 ? "danger-text" : "profit"}>{euro(stat.netProfit)}</td>
                  <td className={stat.unpaid > 0 ? "danger-text" : ""}>{euro(stat.unpaid)}</td>
                  <td>{stat.vacantRooms} 间</td>
                  <td>{stat.occupancy}%</td>
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
                <div className="mobile-record-field"><span>空置</span><strong>{stat.vacantRooms} 间</strong></div>
                <div className="mobile-record-field"><span>入住率</span><strong>{stat.occupancy}%</strong></div>
              </div>
              <Link className="btn" href={`/property-profits/${stat.property.id}`}>查看明细</Link>
            </article>
          ))}
        </div>
      </section>
    </AppLayout>
  );
}
