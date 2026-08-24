export const LOGIN_ACCESS_HANDOFF_TTL_MS = 5_000;
const LOGIN_ACCESS_TELEMETRY_TTL_MS = 60_000;

export type LoginAccessHandoffTelemetry = {
  traceId: string;
  handoffUsed: boolean;
  immediateAccountRequestCount: 1 | 2;
  createdAt: number;
};

type LoginAccessHandoff = {
  accessToken: string;
  expiresAt: number;
  result: Promise<unknown>;
  telemetry: LoginAccessHandoffTelemetry;
};

let activeHandoff: LoginAccessHandoff | null = null;
let latestTelemetry: LoginAccessHandoffTelemetry | null = null;

function isExpired(expiresAt: number) {
  return Date.now() > expiresAt;
}

/**
 * Keeps one already server-verified login result in memory only long enough
 * for the root AccountAccessProvider's SIGNED_IN refresh to consume it.
 * Tokens never leave this module, browser memory, or the current JS context.
 */
export function armLoginAccessHandoff(accessToken: string, traceId: string, result: Promise<unknown>) {
  const createdAt = Date.now();
  const handoff: LoginAccessHandoff = {
    accessToken,
    expiresAt: createdAt + LOGIN_ACCESS_HANDOFF_TTL_MS,
    result,
    telemetry: { traceId, handoffUsed: false, immediateAccountRequestCount: 2, createdAt }
  };
  activeHandoff = handoff;
  latestTelemetry = handoff.telemetry;
}

/** Returns the one-shot result only for the exact in-memory access token. */
export function consumeLoginAccessHandoff(accessToken: string) {
  const handoff = activeHandoff;
  if (!handoff) return null;
  if (isExpired(handoff.expiresAt) || handoff.accessToken !== accessToken) {
    activeHandoff = null;
    return null;
  }
  activeHandoff = null;
  handoff.telemetry.handoffUsed = true;
  handoff.telemetry.immediateAccountRequestCount = 1;
  latestTelemetry = handoff.telemetry;
  return handoff.result;
}

export function getLoginAccessHandoffTelemetry(traceId: string) {
  if (!latestTelemetry || latestTelemetry.traceId !== traceId || isExpired(latestTelemetry.createdAt + LOGIN_ACCESS_TELEMETRY_TTL_MS)) return null;
  return { ...latestTelemetry };
}

export function clearLoginAccessHandoff() {
  activeHandoff = null;
  latestTelemetry = null;
}
