export type RestoreCapabilityInput = {
  accountType: "owner" | "custom";
  accountPlan: "managed" | "free_single";
};

export type RestoreCapability = {
  freeUser: boolean;
  cloudRecoveryEnabled: boolean;
  historyRecoveryEnabled: boolean;
  automaticCloudBackupEnabled: boolean;
  localPreRestoreBackupRequired: boolean;
};

/** One capability owner for the free-user versus full-account Restore split. */
export function getRestoreCapability(input: RestoreCapabilityInput): RestoreCapability {
  const freeUser = input.accountType === "custom" && input.accountPlan === "free_single";
  return {
    freeUser,
    cloudRecoveryEnabled: !freeUser,
    historyRecoveryEnabled: !freeUser,
    automaticCloudBackupEnabled: !freeUser,
    localPreRestoreBackupRequired: freeUser
  };
}
