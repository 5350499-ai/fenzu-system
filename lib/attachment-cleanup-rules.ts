/** Deliberately hard-disabled until a separately authorized rollout. */
export const ATTACHMENT_CLEANUP_EXECUTION_ENABLED = false as const;

function isCalendarDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export type CleanupDepositState = "complete" | "incomplete" | "unknown";
export type CleanupTaskState = "clear" | "pending" | "unknown" | "unavailable";
export type CleanupRoomState = "released" | "occupied" | "unknown";

export type CleanupCandidateInput = {
  actualMoveOutDate: string | null;
  movedOut: boolean;
  hasActiveContract: boolean;
  depositState: CleanupDepositState;
  taskState: CleanupTaskState;
  roomState: CleanupRoomState;
};

export type CleanupSkipReason =
  | "invalid_move_out_date"
  | "missing_move_out_date"
  | "not_moved_out"
  | "active_contract"
  | "not_old_enough"
  | "deposit_not_complete"
  | "deposit_state_unknown"
  | "pending_tasks"
  | "task_state_unknown"
  | "task_source_unavailable"
  | "room_still_occupied"
  | "room_state_unknown";

export function evaluateCleanupCandidate(input: CleanupCandidateInput, cutoffDate: string): { eligible: true } | { eligible: false; reason: CleanupSkipReason } {
  if (!isCalendarDate(input.actualMoveOutDate)) return { eligible: false, reason: input.actualMoveOutDate ? "invalid_move_out_date" : "missing_move_out_date" };
  if (!input.movedOut) return { eligible: false, reason: "not_moved_out" };
  if (input.hasActiveContract) return { eligible: false, reason: "active_contract" };
  if (input.actualMoveOutDate > cutoffDate) return { eligible: false, reason: "not_old_enough" };
  if (input.depositState === "unknown") return { eligible: false, reason: "deposit_state_unknown" };
  if (input.depositState !== "complete") return { eligible: false, reason: "deposit_not_complete" };
  if (input.taskState === "unknown") return { eligible: false, reason: "task_state_unknown" };
  if (input.taskState === "unavailable") return { eligible: false, reason: "task_source_unavailable" };
  if (input.taskState === "pending") return { eligible: false, reason: "pending_tasks" };
  if (input.roomState === "unknown") return { eligible: false, reason: "room_state_unknown" };
  if (input.roomState === "occupied") return { eligible: false, reason: "room_still_occupied" };
  return { eligible: true };
}

export function cleanupSkipReasonLabel(reason: CleanupSkipReason) {
  return {
    invalid_move_out_date: "实际退租日期无法解析",
    missing_move_out_date: "缺少实际退租日期",
    not_moved_out: "租客未处于已退租状态",
    active_contract: "仍存在有效合同",
    not_old_enough: "尚未达到清理期限",
    deposit_not_complete: "押金尚未标记为已处理",
    deposit_state_unknown: "缺少可确认的押金处理状态",
    pending_tasks: "仍有未完成待办",
    task_state_unknown: "无法可靠核验未完成待办",
    task_source_unavailable: "服务端待办功能尚未启用或不可用",
    room_still_occupied: "房间仍由该租客占用",
    room_state_unknown: "无法确认房间是否已解除该租客占用"
  }[reason];
}

export type CleanupStorageOutcome = "deleted" | "missing" | "failed";

/** Pure execution contract: only a verified deletion or known-missing object may remove its index. */
export function cleanupStorageOutcomePlan(outcome: CleanupStorageOutcome) {
  if (outcome === "deleted") return { auditStatus: "deleted", removeAttachmentIndex: true } as const;
  if (outcome === "missing") return { auditStatus: "missing", removeAttachmentIndex: true } as const;
  return { auditStatus: "failed", removeAttachmentIndex: false } as const;
}

export function isCleanupPreviewWindowValid(expiresAt: number, now = Date.now()) {
  return Number.isFinite(expiresAt) && expiresAt >= now;
}
