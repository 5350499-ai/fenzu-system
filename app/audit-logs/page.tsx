"use client";

import { AppLayout } from "@/components/app-layout";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useState } from "react";

type AuditLog = {
  id: string;
  created_at: string;
  actor_username: string | null;
  actor_display_name: string | null;
  action_type: string;
  module_key: string;
  description: string;
  success: boolean;
  before_data: unknown;
  after_data: unknown;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
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
    if (action) params.set("action", action);
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
    setLogs(payload.logs || []);
  }, [action, moduleKey, success]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  return (
    <AppLayout title="操作日志" description="账号、安全与权限管理操作的追加式记录。">
      <section className="card panel audit-panel">
        <div className="filter-grid">
          <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="筛选操作类型" />
          <input value={moduleKey} onChange={(event) => setModuleKey(event.target.value)} placeholder="筛选模块" />
          <select value={success} onChange={(event) => setSuccess(event.target.value)}>
            <option value="">全部结果</option>
            <option value="true">成功</option>
            <option value="false">失败</option>
          </select>
        </div>
        {error ? <p className="danger-text">{error}</p> : null}
        <div className="audit-list">
          {logs.map((log) => (
            <article className="audit-row" key={log.id}>
              <button type="button" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                <span><strong>{log.description}</strong><small>{formatTime(log.created_at)} · {log.actor_display_name || log.actor_username || "系统"}</small></span>
                <span className={"badge " + (log.success ? "success" : "danger")}>{log.success ? "成功" : "失败"}</span>
              </button>
              {expanded === log.id ? <div className="audit-detail"><p>模块：{log.module_key}｜操作：{log.action_type}</p><pre>{JSON.stringify({ before: log.before_data, after: log.after_data }, null, 2)}</pre></div> : null}
            </article>
          ))}
          {!logs.length && !error ? <p className="muted">暂无符合条件的日志。</p> : null}
        </div>
      </section>
    </AppLayout>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
