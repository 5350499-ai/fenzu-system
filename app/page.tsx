import { AppLayout } from "@/components/app-layout";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { AlertTriangle, FileClock, Home, Plus, ReceiptText, ShieldAlert, UserPlus } from "lucide-react";
import Link from "next/link";
import {
  contractReminders,
  expenses,
  properties,
  rentPayments,
  rooms,
  tasks,
  tenants
} from "@/lib/demo-data";
import { euro, roomStatusLabel, roomStatusTone } from "@/lib/format";

const HOME_LIMIT = 5;

export default function DashboardPage() {
  const totalIncome = rentPayments.reduce((sum, item) => sum + item.amountPaid, 0);
  const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
  const totalProfit = totalIncome - totalExpenses;
  const unpaid = rentPayments.reduce((sum, item) => sum + item.amountUnpaid, 0);
  const rentedRooms = rooms.filter((room) => room.status === "rented" || room.status === "moving_out").length;
  const rentableRooms = rooms.filter((room) => room.status !== "maintenance" && room.status !== "paused").length;
  const vacantRooms = rooms.filter((room) => room.status === "vacant").length;
  const occupancy = rentableRooms ? Math.round((rentedRooms / rentableRooms) * 100) : 0;
  const overdueRows = rentPayments
    .filter((payment) => payment.isOverdue)
    .sort((a, b) => b.amountUnpaid - a.amountUnpaid);
  const roomSummaryRows = [...rooms].sort((a, b) => roomPriority(a.status) - roomPriority(b.status));
  const tenantContracts = contractReminders
    .filter((item) => item.type === "tenant")
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const landlordContracts = contractReminders
    .filter((item) => item.type === "landlord")
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const sortedTasks = [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const risks = [
    {
      title: "即将到期合同",
      count: tenantContracts.length,
      note: "租客合同 30 天内到期",
      tone: "amber",
      href: "/reminders",
      icon: <FileClock className="warning-text" size={22} />
    },
    {
      title: "欠租提醒",
      count: overdueRows.length,
      note: `合计 ${euro(unpaid)} 未收`,
      tone: "red",
      href: "/rent-payments",
      icon: <AlertTriangle className="danger-text" size={22} />
    },
    {
      title: "待退押金",
      count: 1,
      note: "退租前需要核对房间",
      tone: "blue",
      href: "/deposits",
      icon: <ShieldAlert className="info-text" size={22} />
    },
    {
      title: "未录入水电费",
      count: landlordContracts.length,
      note: "本月账单待补充",
      tone: "amber",
      href: "/reminders",
      icon: <AlertTriangle className="warning-text" size={22} />
    },
    {
      title: "押金未收",
      count: 3,
      note: "入住资料需要补齐",
      tone: "red",
      href: "/reminders",
      icon: <ShieldAlert className="danger-text" size={22} />
    },
    {
      title: "未支付支出",
      count: 2,
      note: "请核对本月账单",
      tone: "blue",
      href: "/expenses",
      icon: <AlertTriangle className="info-text" size={22} />
    }
  ];

  return (
    <AppLayout title="分租管理仪表盘" description="打开系统后先看利润、欠费、空房和合同风险。">
      <div className="quick-actions">
        <Link className="btn primary" href="/properties">
          <Plus size={17} />
          新增房源
        </Link>
        <Link className="btn soft" href="/rooms">
          <Home size={17} />
          新增房间
        </Link>
        <Link className="btn soft" href="/tenants">
          <UserPlus size={17} />
          新增租客
        </Link>
        <Link className="btn soft" href="/rent-payments">
          <ReceiptText size={17} />
          录入收款
        </Link>
      </div>

      <div className="grid metrics">
        <MetricCard label="本月总收入" value={euro(totalIncome)} note="来自已收房租" />
        <MetricCard label="本月总支出" value={euro(totalExpenses)} note="房东租金与经营支出" />
        <MetricCard label="本月净利润" value={euro(totalProfit)} note="收入减支出" tone="profit" hero />
        <MetricCard label="本年累计利润" value={euro(8600)} note="年度累计演示值" tone="profit" />
        <MetricCard label="应收未收金额" value={euro(unpaid)} note="需要优先跟进" tone="danger" />
        <MetricCard label="入住率" value={`${occupancy}%`} note={`${rentedRooms}/${rentableRooms} 间可出租房间`} tone="info" />
        <MetricCard label="空置房间数" value={`${vacantRooms} 间`} note="可立即安排出租" />
        <MetricCard label="欠费人数" value={`${overdueRows.length} 人`} note="本月未结清租金" tone="danger" />
      </div>

      <section className="grid risk-grid">
        {risks.slice(0, HOME_LIMIT).map((risk) => (
          <Link className="card risk-card" href={risk.href} key={risk.title}>
            <div className="risk-topline">
              <StatusBadge tone={risk.tone}>{risk.title}</StatusBadge>
              {risk.icon}
            </div>
            <div className={`risk-count ${risk.tone === "red" ? "danger-text" : risk.tone === "blue" ? "info-text" : "warning-text"}`}>
              {risk.count}
            </div>
            <div className="metric-note">{risk.note}</div>
          </Link>
        ))}
        <ShowMore total={risks.length} shown={HOME_LIMIT} href="/reminders" compact />
      </section>

      <div className="grid dashboard-panels">
        <section className="card panel">
          <div className="panel-header">
            <h2 className="panel-title">房间状态列表</h2>
            <span className="muted">房源 / 房间 / 租客 / 收款状态</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>房源</th>
                  <th>房间</th>
                  <th>状态</th>
                  <th>当前租客</th>
                  <th>月租</th>
                  <th>是否已收款</th>
                </tr>
              </thead>
              <tbody>
                {roomSummaryRows.slice(0, HOME_LIMIT).map((room) => {
                  const property = properties.find((item) => item.id === room.propertyId);
                  const tenant = tenants.find((item) => item.roomId === room.id && item.status === "active");
                  const payment = rentPayments.find((item) => item.roomId === room.id);
                  return (
                    <tr key={room.id}>
                      <td>{property?.name}</td>
                      <td>{room.name}</td>
                      <td>
                        <StatusBadge tone={roomStatusTone(room.status)}>{roomStatusLabel[room.status]}</StatusBadge>
                      </td>
                      <td>{tenant?.name || "-"}</td>
                      <td>{euro(room.monthlyRent)}</td>
                      <td>
                        {payment ? (
                          <StatusBadge tone={payment.isOverdue ? "red" : "green"}>
                            {payment.isOverdue ? "未结清" : "已收款"}
                          </StatusBadge>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ShowMore total={roomSummaryRows.length} shown={HOME_LIMIT} href="/rooms" />
        </section>

        <section className="card panel">
          <div className="panel-header">
            <h2 className="panel-title">欠费名单</h2>
            <span className="badge red">{euro(unpaid)}</span>
          </div>
          <div className="list">
            {overdueRows.slice(0, HOME_LIMIT).map((payment) => {
              const tenant = tenants.find((item) => item.id === payment.tenantId);
              const room = rooms.find((item) => item.id === payment.roomId);
              return (
                <div className="list-item" key={payment.id}>
                  <div>
                    <div className="list-title">
                      {tenant?.name} · {room?.name}
                    </div>
                    <div className="list-meta">欠费天数：6天</div>
                  </div>
                  <strong className="danger-text">{euro(payment.amountUnpaid)}</strong>
                </div>
              );
            })}
            <ShowMore total={overdueRows.length} shown={HOME_LIMIT} href="/rent-payments" />
          </div>
        </section>
      </div>

      <div className="grid dashboard-panels">
        <section className="card panel">
          <div className="panel-header">
            <h2 className="panel-title">即将到期合同</h2>
            <span className="muted">租客合同 30 天内</span>
          </div>
          <div className="list">
            {tenantContracts
              .slice(0, HOME_LIMIT)
              .map((item) => (
                <div className="list-item" key={item.id}>
                  <div>
                    <div className="list-title">
                      {item.personName} · {item.roomName}
                    </div>
                    <div className="list-meta">到期日期：{item.endDate}</div>
                  </div>
                  <StatusBadge tone="amber">剩余 {item.daysLeft} 天</StatusBadge>
                </div>
              ))}
            <ShowMore total={tenantContracts.length} shown={HOME_LIMIT} href="/reminders" />
          </div>
        </section>

        <section className="card panel">
          <div className="panel-header">
            <h2 className="panel-title">房东合同到期提醒</h2>
            <span className="muted">房东合同 60 天内</span>
          </div>
          <div className="list">
            {landlordContracts
              .slice(0, HOME_LIMIT)
              .map((item) => (
                <div className="list-item" key={item.id}>
                  <div>
                    <div className="list-title">
                      {item.propertyName} · {item.personName}
                    </div>
                    <div className="list-meta">到期日期：{item.endDate}</div>
                  </div>
                  <StatusBadge tone="amber">剩余 {item.daysLeft} 天</StatusBadge>
                </div>
              ))}
            <ShowMore total={landlordContracts.length} shown={HOME_LIMIT} href="/reminders" />
          </div>
        </section>
      </div>

      <section className="card panel" style={{ marginTop: 18 }}>
        <div className="panel-header">
          <h2 className="panel-title">待办事项</h2>
          <span className="muted">收租、续约、退押金</span>
        </div>
        <div className="list">
          {sortedTasks.slice(0, HOME_LIMIT).map((task) => (
            <div className="list-item" key={task.id}>
              <div>
                <div className="list-title">{task.title}</div>
                <div className="list-meta">截止日期：{task.dueDate}</div>
              </div>
              <StatusBadge tone={task.status === "待处理" ? "blue" : "green"}>{task.status}</StatusBadge>
            </div>
          ))}
          <ShowMore total={sortedTasks.length} shown={HOME_LIMIT} href="/tasks" />
        </div>
      </section>
    </AppLayout>
  );
}

function ShowMore({
  total,
  shown,
  href,
  compact
}: {
  total: number;
  shown: number;
  href: string;
  compact?: boolean;
}) {
  const hidden = Math.max(total - shown, 0);
  if (hidden <= 0) return null;

  return (
    <Link className={compact ? "show-more compact" : "show-more"} href={href}>
      还有 {hidden} 条，查看全部
    </Link>
  );
}

function roomPriority(status: string) {
  const priority: Record<string, number> = {
    vacant: 1,
    moving_out: 2,
    maintenance: 3,
    paused: 4,
    reserved: 5,
    rented: 6
  };
  return priority[status] ?? 99;
}
