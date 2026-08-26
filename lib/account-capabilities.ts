/**
 * Canonical product capability and quota root.
 *
 * This is product policy, not a replacement for account permissions or RLS.
 * Server and database security boundaries remain authoritative enforcement
 * layers. The legacy managed/free_single adapter exists only for compatibility
 * and deliberately never maps managed to Premium.
 */

export const PRODUCT_TIERS = ["FREE", "PREMIUM", "INTERNAL_FULL"] as const;
export type ProductTier = (typeof PRODUCT_TIERS)[number];

export const FREE_SINGLE_LIMITS = {
  maxProperties: 5,
  maxRoomsPerProperty: 10
} as const;

export type AccountCapabilities = {
  tier: ProductTier;
  canUsePartnership: boolean;
  canUseCloudBackup: boolean;
  canUseCloudHistory: boolean;
  canUseAutomaticCloudBackup: boolean;
  canUsePremiumThemes: boolean;
  canUseAttachments: boolean;
  canUseDiagnostics: boolean;
  canUseLocalBackup: boolean;
  canUseLocalRestore: boolean;
  maxProperties: number | null;
  maxRoomsPerProperty: number | null;
};

const CAPABILITIES: Readonly<Record<ProductTier, AccountCapabilities>> = {
  FREE: {
    tier: "FREE",
    canUsePartnership: false,
    canUseCloudBackup: false,
    canUseCloudHistory: false,
    canUseAutomaticCloudBackup: false,
    canUsePremiumThemes: false,
    canUseAttachments: false,
    canUseDiagnostics: false,
    canUseLocalBackup: true,
    canUseLocalRestore: true,
    maxProperties: FREE_SINGLE_LIMITS.maxProperties,
    maxRoomsPerProperty: FREE_SINGLE_LIMITS.maxRoomsPerProperty
  },
  PREMIUM: {
    tier: "PREMIUM",
    canUsePartnership: true,
    canUseCloudBackup: true,
    canUseCloudHistory: true,
    canUseAutomaticCloudBackup: true,
    // Premium Themes are reserved for a later phase and are not activated.
    canUsePremiumThemes: false,
    canUseAttachments: false,
    canUseDiagnostics: false,
    canUseLocalBackup: true,
    canUseLocalRestore: true,
    // Commercial Premium limits are intentionally TBD in Phase 1.
    maxProperties: null,
    maxRoomsPerProperty: null
  },
  INTERNAL_FULL: {
    tier: "INTERNAL_FULL",
    canUsePartnership: true,
    canUseCloudBackup: true,
    canUseCloudHistory: true,
    canUseAutomaticCloudBackup: true,
    canUsePremiumThemes: true,
    canUseAttachments: true,
    canUseDiagnostics: true,
    canUseLocalBackup: true,
    canUseLocalRestore: true,
    // Existing managed/internal accounts have no new Phase 1 quota imposed.
    maxProperties: null,
    maxRoomsPerProperty: null
  }
};

export function getAccountCapabilities(tier: ProductTier): AccountCapabilities {
  return { ...CAPABILITIES[tier] };
}

export type LegacyCapabilityInput = {
  accountType: "owner" | "custom";
  accountPlan: "managed" | "free_single";
};

/**
 * Compatibility adapter for the current database model. `managed` is the
 * existing full/internal path, not Premium and not a commercial entitlement.
 * A free owner is kept on the existing full path, matching current Restore
 * semantics; ordinary free custom accounts map to FREE.
 */
export function resolveLegacyProductTier(input: LegacyCapabilityInput): ProductTier {
  if (input.accountType === "custom" && input.accountPlan === "free_single") return "FREE";
  return "INTERNAL_FULL";
}

export function getLegacyAccountCapabilities(input: LegacyCapabilityInput): AccountCapabilities {
  return getAccountCapabilities(resolveLegacyProductTier(input));
}

