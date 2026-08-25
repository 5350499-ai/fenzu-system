export type BackupRestoreEntityScope = "CORE_RESTORE" | "PREVIEW_ONLY" | "AUDIT_ONLY" | "SYSTEM";

export type BackupRestoreEntity = {
  key: string;
  table?: string;
  displayLabelZh: string;
  backupIncluded: boolean;
  restoreIncluded: boolean;
  previewCurrentCountIncluded: boolean;
  consistencyGateIncluded: boolean;
  restoreOrder?: number;
  scope: BackupRestoreEntityScope;
  /** Live-schema identity and dependency metadata for Restore validation. */
  primaryKey?: readonly string[];
  conflictKey?: readonly string[];
  ownerColumn?: string;
  fkDependencies?: readonly string[];
  idempotencyRole?: "NONE" | "REQUEST";
};

/**
 * Canonical application-side description of the current backup/restore
 * boundary. PostgreSQL remains the authority for live columns and the
 * migration remains the authority for the transaction, while UI/count code
 * consumes this registry instead of maintaining another label list.
 */
export const BACKUP_RESTORE_ENTITY_REGISTRY = [
  { key: "properties", table: "properties", displayLabelZh: "房源", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 1, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], ownerColumn: "user_id", fkDependencies: [], idempotencyRole: "NONE" },
  { key: "rooms", table: "rooms", displayLabelZh: "房间", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 2, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], ownerColumn: "user_id", fkDependencies: ["properties"], idempotencyRole: "NONE" },
  { key: "tenants", table: "tenants", displayLabelZh: "租客", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 3, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], ownerColumn: "user_id", fkDependencies: ["properties", "rooms"], idempotencyRole: "NONE" },
  { key: "contracts", table: "contracts", displayLabelZh: "合同", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 4, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], ownerColumn: "user_id", fkDependencies: ["properties", "rooms", "tenants"], idempotencyRole: "NONE" },
  { key: "rentPayments", table: "rent_payments", displayLabelZh: "收租", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 5, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], ownerColumn: "user_id", fkDependencies: ["tenants", "properties", "rooms", "deposits"], idempotencyRole: "NONE" },
  { key: "expenses", table: "expenses", displayLabelZh: "支出", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 6, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], ownerColumn: "user_id", fkDependencies: ["properties", "rooms"], idempotencyRole: "NONE" },
  { key: "deposits", table: "deposits", displayLabelZh: "押金", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 7, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], ownerColumn: "user_id", fkDependencies: ["tenants", "properties", "rooms"], idempotencyRole: "NONE" },
  { key: "viewingAppointments", table: "viewing_appointments", displayLabelZh: "看房预约", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 8, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], ownerColumn: "user_id", fkDependencies: ["properties", "rooms"], idempotencyRole: "NONE" },
  { key: "tasks", table: "tasks", displayLabelZh: "待办", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 9, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], ownerColumn: "user_id", fkDependencies: ["properties", "rooms", "tenants", "contracts", "rentPayments", "deposits"], idempotencyRole: "NONE" },
  { key: "partners", table: "partners", displayLabelZh: "合伙人", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 10, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], ownerColumn: "workspace_owner_id", fkDependencies: [], idempotencyRole: "NONE" },
  { key: "partnerShares", table: "partner_property_shares", displayLabelZh: "比例方案", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 11, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], ownerColumn: "workspace_owner_id", fkDependencies: ["properties", "partners"], idempotencyRole: "NONE" },
  { key: "partnerNameHistory", table: "partner_name_history", displayLabelZh: "合伙人名称历史", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 12, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], ownerColumn: "workspace_owner_id", fkDependencies: ["partners"], idempotencyRole: "NONE" },
  { key: "settlementBatches", table: "partner_settlement_batches", displayLabelZh: "结算批次", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 13, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], ownerColumn: "workspace_owner_id", fkDependencies: ["properties"], idempotencyRole: "NONE" },
  { key: "settlementSnapshots", displayLabelZh: "结算快照", backupIncluded: true, restoreIncluded: false, previewCurrentCountIncluded: true, consistencyGateIncluded: true, scope: "PREVIEW_ONLY" },
  { key: "partnerSettlementPartnerSnapshots", table: "partner_settlement_partner_snapshots", displayLabelZh: "结算合伙人快照", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: false, consistencyGateIncluded: true, restoreOrder: 14, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], fkDependencies: ["settlementBatches", "partners"], idempotencyRole: "NONE" },
  { key: "partnerSettlementSegmentSnapshots", table: "partner_settlement_segment_snapshots", displayLabelZh: "结算区间快照", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: false, consistencyGateIncluded: true, restoreOrder: 15, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], fkDependencies: ["settlementBatches"], idempotencyRole: "NONE" },
  { key: "partnerSettlementTransferSnapshots", table: "partner_settlement_transfer_snapshots", displayLabelZh: "结算转账快照", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: false, consistencyGateIncluded: true, restoreOrder: 16, scope: "CORE_RESTORE", primaryKey: ["id"], conflictKey: ["id"], fkDependencies: ["settlementBatches", "partners"], idempotencyRole: "NONE" },
  { key: "checkInRequests", table: "check_in_requests", displayLabelZh: "入住请求记录", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 17, scope: "CORE_RESTORE", primaryKey: ["client_request_id"], conflictKey: ["client_request_id"], ownerColumn: "workspace_owner_id", fkDependencies: ["properties", "rooms", "tenants", "contracts", "rentPayments", "deposits"], idempotencyRole: "REQUEST" },
  { key: "tenantCreateRequests", table: "tenant_create_requests", displayLabelZh: "租客创建请求记录", backupIncluded: true, restoreIncluded: true, previewCurrentCountIncluded: true, consistencyGateIncluded: true, restoreOrder: 18, scope: "CORE_RESTORE", primaryKey: ["client_request_id"], conflictKey: ["client_request_id"], ownerColumn: "workspace_owner_id", fkDependencies: ["properties", "rooms", "tenants", "contracts", "rentPayments", "deposits"], idempotencyRole: "REQUEST" },
  { key: "accounts", displayLabelZh: "账号", backupIncluded: true, restoreIncluded: false, previewCurrentCountIncluded: true, consistencyGateIncluded: false, scope: "PREVIEW_ONLY" },
  { key: "auditLogs", displayLabelZh: "操作日志（仅审计，不参与一致性校验）", backupIncluded: true, restoreIncluded: false, previewCurrentCountIncluded: true, consistencyGateIncluded: false, scope: "AUDIT_ONLY" },
  { key: "settings", displayLabelZh: "系统设置", backupIncluded: true, restoreIncluded: false, previewCurrentCountIncluded: false, consistencyGateIncluded: false, scope: "SYSTEM" },
] as const satisfies readonly BackupRestoreEntity[];

export const CORE_RESTORE_ENTITY_REGISTRY = BACKUP_RESTORE_ENTITY_REGISTRY.filter((entity) => entity.scope === "CORE_RESTORE");
export const PREVIEW_ENTITY_REGISTRY = BACKUP_RESTORE_ENTITY_REGISTRY.filter((entity) => entity.previewCurrentCountIncluded);

export function getBackupRestoreEntity(key: string) {
  return BACKUP_RESTORE_ENTITY_REGISTRY.find((entity) => entity.key === key);
}

export function getBackupRestoreDisplayLabel(key: string) {
  return getBackupRestoreEntity(key)?.displayLabelZh || key;
}
