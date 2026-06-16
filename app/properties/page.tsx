"use client";

import { AppLayout } from "@/components/app-layout";
import { CrudPage } from "@/components/crud-page";
import { StatusBadge } from "@/components/status-badge";
import { properties } from "@/lib/demo-data";
import { noteSummary } from "@/lib/format";
import Link from "next/link";

export default function PropertiesPage() {
  return (
    <AppLayout title="房源管理" description="管理每一套分租房源、房东和是否允许分租。">
      <CrudPage
        title="房源"
        storageKey="v1-properties"
        createLabel="新增房源"
        initialRows={properties.map((item) => ({
          id: item.id,
          name: item.name,
          address: item.address,
          city: item.city,
          landlordName: item.landlordName,
          subletAllowed: item.subletAllowed,
          notes: item.notes || ""
        }))}
        fields={[
          { name: "name", label: "房源名称", type: "text" },
          { name: "address", label: "地址", type: "text" },
          { name: "city", label: "城市", type: "text" },
          { name: "landlordName", label: "房东姓名", type: "text" },
          { name: "subletAllowed", label: "是否允许分租", type: "checkbox" },
          { name: "notes", label: "备注", type: "textarea" }
        ]}
        columns={[
          {
            name: "name",
            label: "房源名称",
            render: (row) => <Link className="table-link" href={`/properties/${row.id}`}>{String(row.name || "-")}</Link>
          },
          { name: "address", label: "地址" },
          { name: "city", label: "城市" },
          { name: "landlordName", label: "房东" },
          {
            name: "subletAllowed",
            label: "允许分租",
            render: (row) => (
              <StatusBadge tone={row.subletAllowed ? "green" : "red"}>
                {row.subletAllowed ? "允许" : "不允许"}
              </StatusBadge>
            )
          },
          {
            name: "notes",
            label: "备注",
            render: (row) => <span title={String(row.notes || "")}>{noteSummary(String(row.notes || ""))}</span>
          },
          {
            name: "manage",
            label: "进入管理",
            render: (row) => <Link className="btn" href={`/properties/${row.id}`}>进入管理</Link>
          }
        ]}
      />
    </AppLayout>
  );
}
