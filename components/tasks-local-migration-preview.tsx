"use client";

import type { TaskMigrationPreviewResponse } from "@/lib/task-repository";

export function TasksLocalMigrationPreview({
  preview,
  isMigrating,
  onMigrate,
  onLater
}: {
  preview: TaskMigrationPreviewResponse;
  isMigrating: boolean;
  onMigrate: () => void;
  onLater: () => void;
}) {
  return (
    <section className="card panel" aria-live="polite">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">本机待办迁移预览</h3>
          <p className="muted">迁移只处理当前浏览器的数据；确认前不会上传，也不会删除本地待办。</p>
        </div>
        <span className="badge blue">需确认</span>
      </div>
      <div className="mobile-record-fields">
        <div className="mobile-record-field"><span>本地待办</span><strong>{preview.total}</strong></div>
        <div className="mobile-record-field"><span>可迁移</span><strong>{preview.readyToMigrate}</strong></div>
        <div className="mobile-record-field"><span>已存在</span><strong>{preview.duplicate}</strong></div>
        <div className="mobile-record-field"><span>字段无效</span><strong>{preview.invalid}</strong></div>
      </div>
      <p className="muted">其中 {preview.unlinked} 条为普通无租客关联待办，可以迁移，但不会影响任何租客附件清理判断。</p>
      <details>
        <summary>查看每项处理方式</summary>
        <div className="mobile-card-list" style={{ marginTop: 10 }}>
          {preview.rows.map((row, index) => <div className="mobile-record-card" key={`${row.key}:${index}`}>
            <strong>{row.task.title || "未命名待办"}</strong>
            <span className={row.disposition === "invalid" || row.skipReason ? "badge red" : row.disposition === "duplicate" ? "badge yellow" : "badge blue"}>
              {row.skipReason || (row.disposition === "migratable" ? "将迁移（关联租客）" : row.disposition === "unlinked" ? "将迁移（普通待办）" : row.disposition === "duplicate" ? "跳过（服务端已存在）" : "跳过（字段无效）")}
            </span>
          </div>)}
        </div>
      </details>
      <div className="top-actions">
        <button className="btn" type="button" onClick={onLater} disabled={isMigrating}>稍后处理</button>
        <button className="btn primary" type="button" onClick={onMigrate} disabled={isMigrating || preview.readyToMigrate === 0}>
          {isMigrating ? "正在迁移…" : "确认迁移本机待办"}
        </button>
      </div>
    </section>
  );
}
