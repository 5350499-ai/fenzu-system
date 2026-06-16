"use client";

import { AppLayout } from "@/components/app-layout";
import { CrudPage } from "@/components/crud-page";
import { StatusBadge } from "@/components/status-badge";
import { contractReminders, rentPayments } from "@/lib/demo-data";
import { euro } from "@/lib/format";

const reminders = [
  ...rentPayments
    .filter((item) => item.isOverdue)
    .sort((a, b) => b.amountUnpaid - a.amountUnpaid)
    .map((item) => ({
      id: `rent-${item.id}`,
      type: "欠租提醒",
      title: `欠租 ${euro(item.amountUnpaid)}`,
      dueDate: item.rentMonth,
      status: "待处理",
      priority: item.amountUnpaid >= 300 ? "高" : "普通"
    })),
  ...contractReminders
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map((item) => ({
      id: `contract-${item.id}`,
      type: item.type === "tenant" ? "合同即将到期" : "房东合同即将到期",
      title: `${item.personName} · 剩余 ${item.daysLeft} 天`,
      dueDate: item.endDate,
      status: "待处理",
      priority: item.daysLeft <= 30 ? "高" : "普通"
    })),
  {
    id: "deposit-1",
    type: "押金未退",
    title: "王五退租前押金核对",
    dueDate: "2026-07-10",
    status: "待处理",
    priority: "普通"
  },
  {
    id: "utility-1",
    type: "未录入水电费",
    title: "本月水电网账单待录入",
    dueDate: "2026-06-30",
    status: "待处理",
    priority: "普通"
  }
];

export default function RemindersPage() {
  return (
    <AppLayout title="提醒中心" description="集中查看欠租、合同、押金、支出和空置提醒。">
      <CrudPage
        title="提醒"
        storageKey="v1-reminders"
        createLabel="新增提醒"
        initialRows={reminders}
        fields={[
          { name: "type", label: "提醒类型", type: "select", options: ["欠租提醒", "合同即将到期", "房东合同即将到期", "押金未收", "押金未退", "未支付支出", "房间空置超过7天", "未录入水电费"] },
          { name: "title", label: "提醒内容", type: "text" },
          { name: "dueDate", label: "截止日期", type: "date" },
          { name: "status", label: "状态", type: "select", options: ["待处理", "已完成", "已取消"] },
          { name: "priority", label: "优先级", type: "select", options: ["低", "普通", "高", "紧急"] }
        ]}
        columns={[
          { name: "type", label: "提醒类型" },
          { name: "title", label: "提醒内容" },
          { name: "dueDate", label: "截止日期" },
          {
            name: "status",
            label: "状态",
            render: (row) => <StatusBadge tone={row.status === "待处理" ? "amber" : "green"}>{row.status}</StatusBadge>
          },
          {
            name: "priority",
            label: "优先级",
            render: (row) => (
              <StatusBadge tone={row.priority === "高" || row.priority === "紧急" ? "red" : "blue"}>
                {row.priority}
              </StatusBadge>
            )
          }
        ]}
      />
    </AppLayout>
  );
}
