import { getLegacyAccountCapabilities, type LegacyCapabilityInput } from "./account-capabilities";

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
  const capabilities = getLegacyAccountCapabilities(input as LegacyCapabilityInput);
  const freeUser = capabilities.tier === "FREE";
  return {
    freeUser,
    cloudRecoveryEnabled: capabilities.canUseCloudBackup,
    historyRecoveryEnabled: capabilities.canUseCloudHistory,
    automaticCloudBackupEnabled: capabilities.canUseAutomaticCloudBackup,
    localPreRestoreBackupRequired: !capabilities.canUseCloudBackup
  };
}
