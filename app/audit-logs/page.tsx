"use client";

import { AppLayout } from "@/components/app-layout";
import { supabase } from "@/lib/supabase";
import { useAccountAccess } from "@/components/account-access";
import { formatCurrency } from "@/lib/currency";
import { buildAuditLogSummary, getAuditBusinessPresentation, groupAuditEventsForDisplay, type AuditDisplayGroup } from "@/lib/audit-log-summary";
import { useCallback, useEffect, useState } from "react";

type AuditLog = {
  id: string;
  created_at: string;
  actor_username: string | null;
  actor_display_name: string | null;
  action_type: string;
  module_key: string;
  entity_id: string | null;
  room_id?: string | null;
  tenant_id?: string | null;
  description: string;
  success: boolean;
  before_data: unknown;
  after_data: unknown;
  amount: number | string | null;
};

export default function AuditLogsPage() {
  const access = useAccountAccess();
  const [groups, setGroups] = useState<Array<AuditDisplayGroup<AuditLog>>>([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [moduleKey, setModuleKey] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase 未配置。");
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setError("登录已失效，请重新登录。");
      return;
    }
    const params = new URLSearchParams();
    if (moduleKey) params.set("module", moduleKey);
    if (success) params.set("success", success);
    const response = await fetch("/api/audit-logs?" + params.toString(), {
      headers: { Authorization: "Bearer " + data.session.access_token }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || "无法加载操作日志。");
      return;
    }
    setError("");
    const rawLogs = payload.logs || [];
    setGroups(payload.groups || groupAuditEventsForDisplay(rawLogs));
  }, [moduleKey, success]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  return (
    <AppLayout title="操作日志" description="账号、安全与权限管理操作的追加式记录。">
      <section className="card panel audit-panel">
        <div className="filter-grid">
          <select value={action} onChange={(event) => setAction(event.target.value)}><option value="">全部操作</option><option value="新增">新增</option><option value="修改">修改</option><option value="删除">删除</option></select>
          <select value={moduleKey} onChange={(event) => setModuleKey(event.target.value)}><option value="">全部模块</option>{Object.entries(moduleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={success} onChange={(event) => setSuccess(event.target.value)}>
            <option value="">全部结果</option>
            <option value="true">成功</option>
            <option value="false">失败</option>
          </select>
        </div>
        {error ? <p className="danger-text">{error}</p> : null}
        <div className="audit-list">
          {groups.filter((group) => !action || actionLabel(group.primary.action_type) === action).map((group) => {
            const log = group.primary;
            const presentation = group.presentation;
            return <article className="audit-row" key={log.id}>
              <button type="button" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                <span><strong>{businessDescription(log, access.currencyCode)}</strong><small>{formatTime(log.created_at)} · {log.actor_display_name || log.actor_username || "本人"}</small></span>
                <span className={"badge " + (log.success ? "success" : "danger")}>{log.success ? "成功" : "失败"}</span>
              </button>
              {expanded === log.id ? <div className="audit-detail"><p>模块：{moduleLabel(log.module_key)}｜操作：{actionLabel(log.action_type)}</p>{presentation ? <><p><strong>{presentation.title}</strong></p><p>房租：{formatCurrency(presentation.rentAmount, access.currencyCode)}</p><p>押金：{formatCurrency(presentation.depositAmount, access.currencyCode)}</p><p>合计：{formatCurrency(presentation.totalAmount, access.currencyCode)}</p><p>结果：{log.success ? "成功" : "失败"}</p></> : safeSummary(log, access.currencyCode) ? <p>{safeSummary(log, access.currencyCode)}</p> : <p className="muted">该操作没有可展示的业务摘要。</p>}{group.technicalChildren.length ? <details><summary>技术明细（{group.technicalChildren.length} 条）</summary>{group.technicalChildren.map((child) => <p key={child.id}>{businessDescription(child, access.currencyCode)}</p>)}</details> : null}</div> : null}
            </article>;
          })}
          {!groups.filter((group) => !action || actionLabel(group.primary.action_type) === action).length && !error ? <p className="muted">暂无符合条件的日志。</p> : null}
        </div>
      </section>
    </AppLayout>
  );
}

const moduleLabels: Record<string, string> = { properties: "房源", rooms: "房间", tenants: "租客", contracts: "合同", rent_payments: "收款", expenses: "支出", deposits: "押金", reminders: "提醒", partners: "成员", partnership_settlement: "合伙结算", settings: "设置", auth: "账号", audit_logs: "操作日志", tasks: "待办", viewing_appointments: "看房预约" };
function moduleLabel(value: string) { return moduleLabels[value] || "系统"; }
function actionLabel(value: string) {
  if (value === "linked_receipt_void") return "作废";
  if (value === "linked_receipt_delete") return "永久删除";
  if (value === "insert" || value.startsWith("create") || value.includes("registered")) return "新增";
  if (value === "update" || value.startsWith("rename") || value.startsWith("adjust") || value.startsWith("deactivate")) return "修改";
  if (value === "delete" || value.startsWith("cancel")) return "删除";
  if (value.includes("login")) return "登录";
  if (value.includes("export")) return "导出";
  if (value.includes("settlement")) return "结算";
  return "操作";
}
function businessDescription(log: AuditLog, currencyCode: Parameters<typeof formatCurrency>[1]) {
  const presentation = getAuditBusinessPresentation(log);
  if (presentation) return `${presentation.title} · ${formatCurrency(presentation.totalAmount, currencyCode)}`;
  const action = actionLabel(log.action_type);
  const module = moduleLabel(log.module_key);
  const summary = safeSummary(log, currencyCode);
  return summary ? `${action}${module} · ${summary}` : `${action}${module}`;
}
function safeSummary(log: AuditLog, currencyCode: Parameters<typeof formatCurrency>[1]) {
  return buildAuditLogSummary(log, currencyCode, formatCurrency);
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
