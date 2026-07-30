"use client";

import { useMemo } from "react";
import { buildTaskMigrationPreview, TASKS_SERVER_SYNC_ENABLED, type LocalTaskLike, type ServerTaskLike } from "@/lib/task-management";

export function TasksLocalMigrationPreview({ localTasks, existingTasks = [] }: { localTasks: LocalTaskLike[]; existingTasks?: ServerTaskLike[] }) {
  const preview = useMemo(() => buildTaskMigrationPreview(localTasks, existingTasks), [localTasks, existingTasks]);
  return (
    <section className="card panel" aria-live="polite">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">本地待办迁移预览</h3>
          <p className="muted">仅显示本浏览器的本地数据，不会自动上传或删除。</p>
        </div>
        <span className="badge blue">{TASKS_SERVER_SYNC_ENABLED ? "服务端功能已配置" : "功能尚未启用"}</span>
      </div>
      <div className="mobile-record-fields">
        <div className="mobile-record-field"><span>本地待办</span><strong>{preview.total}</strong></div>
        <div className="mobile-record-field"><span>可迁移</span><strong>{preview.migratable}</strong></div>
        <div className="mobile-record-field"><span>无租客关联</span><strong>{preview.unlinked}</strong></div>
        <div className="mobile-record-field"><span>重复</span><strong>{preview.duplicate}</strong></div>
        <div className="mobile-record-field"><span>无效</span><strong>{preview.invalid}</strong></div>
      </div>
    </section>
  );
}
