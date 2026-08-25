type RestoreFailureDiagnostic = {
  restoreSessionId: string;
  backupId?: string | null;
  recoveryPointId?: string | null;
  stage: string;
  table?: string | null;
  column?: string | null;
  constraint?: string | null;
  sqlState?: string | null;
  recordId?: string | null;
  workspace?: string | null;
  actorType?: string | null;
  mode: "dry_run" | "restore";
  message?: string | null;
};

/**
 * Restore failure evidence must survive the transaction that failed. This is
 * deliberately a structured server log, not an audit row in the Restore
 * transaction: rollback must not erase the failure evidence.
 */
export function emitRestoreFailureDiagnostic(value: RestoreFailureDiagnostic) {
  console.error("RESTORE_FAILURE_DIAGNOSTIC", {
    ...value,
    emittedAt: new Date().toISOString(),
    transactionOutcome: "rolled_back_or_not_started"
  });
}
