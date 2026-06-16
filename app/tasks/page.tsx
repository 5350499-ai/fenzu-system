"use client";

import { AppLayout } from "@/components/app-layout";
import { CrudPage } from "@/components/crud-page";
import { StatusBadge } from "@/components/status-badge";
import { tasks } from "@/lib/demo-data";

export default function TasksPage() {
  return (
    <AppLayout title="待办管理" description="查看和管理所有收租、续约、退押金待办。">
      <CrudPage
        title="待办"
        storageKey="v1-tasks"
        createLabel="新增待办"
        initialRows={tasks.map((item) => ({
          id: item.id,
          title: item.title,
          dueDate: item.dueDate,
          status: item.status,
          priority: "普通"
        }))}
        fields={[
          { name: "title", label: "待办内容", type: "text" },
          { name: "dueDate", label: "截止日期", type: "date" },
          { name: "status", label: "状态", type: "select", options: ["待处理", "已完成", "已取消"] },
          { name: "priority", label: "优先级", type: "select", options: ["低", "普通", "高", "紧急"] }
        ]}
        columns={[
          { name: "title", label: "待办内容" },
          { name: "dueDate", label: "截止日期" },
          {
            name: "status",
            label: "状态",
            render: (row) => <StatusBadge tone={row.status === "待处理" ? "blue" : "green"}>{row.status}</StatusBadge>
          },
          { name: "priority", label: "优先级" }
        ]}
      />
    </AppLayout>
  );
}
