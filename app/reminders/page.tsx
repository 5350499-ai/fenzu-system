"use client";

import { AppLayout } from "@/components/app-layout";
import { CrudPage } from "@/components/crud-page";
import { StatusBadge } from "@/components/status-badge";

export default function RemindersPage() {
  return (
    <AppLayout title="提醒中心" description="集中查看欠租、合同、押金、支出和空置提醒。">
      <CrudPage
        title="提醒"
        storageKey="v1-tasks"
        createLabel="新增提醒"
        initialRows={[]}
        fields={[
          { name: "title", label: "提醒内容", type: "text" },
          { name: "dueDate", label: "截止日期", type: "date" },
          { name: "status", label: "状态", type: "select", options: ["待处理", "已完成", "已取消"] },
          { name: "priority", label: "优先级", type: "select", options: ["低", "普通", "高", "紧急"] },
          { name: "notes", label: "备注", type: "textarea" }
        ]}
        columns={[
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
          },
          { name: "notes", label: "备注" }
        ]}
      />
    </AppLayout>
  );
}
