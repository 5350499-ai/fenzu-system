import "server-only";

import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import {
  createCustomAccount,
  PRIMARY_OWNER_ID,
  type AccountBootstrapFailureStage
} from "@/lib/server/account-management";
import type { AccountProfileRow, AccountRequestContext } from "@/lib/server/account-auth";
import { AccountApiError } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { FREE_SINGLE_PLAN } from "@/lib/free-single";

const SYNTHETIC_MARKER = "SYNTHETIC AUTOMATED QA";
const SYNTHETIC_EMAIL_DOMAIN = "synthetic.fenzu-system.vercel.app";

export type SyntheticQaBootstrapResult = {
  userId: string;
  email: string;
  username: string;
  password: string;
  workspaceOwnerId: string;
  marker: typeof SYNTHETIC_MARKER;
};

export type SyntheticQaBootstrapOptions = {
  authorizationSecret: unknown;
  failureStage?: AccountBootstrapFailureStage;
};

function secretsMatch(provided: unknown, expected: string) {
  if (typeof provided !== "string" || !provided || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function assertSyntheticBootstrapEnabled(options: SyntheticQaBootstrapOptions) {
  if (process.env.SYNTHETIC_QA_BOOTSTRAP_ENABLED !== "true") {
    throw new AccountApiError("Synthetic QA bootstrap is disabled.", 503, "synthetic_bootstrap_disabled");
  }
  const expected = process.env.SYNTHETIC_QA_BOOTSTRAP_SECRET;
  if (!expected || !secretsMatch(options.authorizationSecret, expected)) {
    throw new AccountApiError("Synthetic QA bootstrap authorization failed.", 401, "synthetic_bootstrap_unauthorized");
  }
  if (options.failureStage && process.env.NODE_ENV === "production") {
    throw new AccountApiError("Failure injection is disabled in Production.", 403, "synthetic_failure_injection_disabled");
  }
}

function createSyntheticPassword() {
  return `Qa-${randomBytes(24).toString("base64url")}-A1`;
}

async function loadBootstrapActor(): Promise<AccountRequestContext> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("user_profiles")
    .select("auth_user_id,workspace_owner_id,username,display_name,account_type,account_plan,status,property_access_mode,must_change_password,sessions_revoked_at,last_login_at,last_activity_at,disabled_at,disabled_by,created_at,updated_at")
    .eq("auth_user_id", PRIMARY_OWNER_ID)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) throw new AccountApiError("Canonical bootstrap actor is unavailable.", 503, "synthetic_bootstrap_actor_unavailable");
  return {
    accessToken: "synthetic-qa-internal-bootstrap",
    userId: PRIMARY_OWNER_ID,
    sessionId: null,
    profile: data as AccountProfileRow,
    requestId: randomUUID(),
    ipAddress: null,
    userAgent: "synthetic-qa-bootstrap"
  };
}

/**
 * Server-only, feature-flagged wrapper around the canonical custom-account
 * bootstrap. It returns credentials only to the in-memory caller so the QA
 * process can immediately perform a normal password sign-in. No HTTP route
 * exposes this result.
 */
export async function bootstrapSyntheticQaAccount(options: SyntheticQaBootstrapOptions): Promise<SyntheticQaBootstrapResult> {
  assertSyntheticBootstrapEnabled(options);
  const actor = await loadBootstrapActor();
  const admin = getSupabaseAdmin();
  const { data: existingProfiles, error: existingProfileError } = await admin
    .from("user_profiles")
    .select("auth_user_id,username,display_name,workspace_owner_id,account_plan,status")
    .eq("display_name", SYNTHETIC_MARKER)
    .eq("account_plan", FREE_SINGLE_PLAN)
    .like("username", "synthetic_automated_qa_%")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (existingProfileError) throw new AccountApiError("Synthetic bootstrap lookup failed.", 503, "synthetic_bootstrap_lookup_failed");

  const suffix = randomUUID().replaceAll("-", "");
  const password = createSyntheticPassword();
  const existing = existingProfiles?.[0];
  let userId: string;
  let username: string;
  let email: string;
  if (existing) {
    const { data: identity, error: identityError } = await admin
      .from("account_auth_identities")
      .select("auth_email")
      .eq("auth_user_id", existing.auth_user_id)
      .maybeSingle();
    if (identityError || !identity?.auth_email) throw new AccountApiError("Synthetic bootstrap identity is unavailable.", 503, "synthetic_bootstrap_identity_unavailable");
    const { error: passwordError } = await admin.auth.admin.updateUserById(existing.auth_user_id, { password, email_confirm: true });
    if (passwordError) throw new AccountApiError("Synthetic bootstrap password reset failed.", 503, "synthetic_bootstrap_password_reset_failed");
    userId = existing.auth_user_id;
    username = existing.username;
    email = identity.auth_email;
  } else {
    email = `synthetic-automated-qa-${suffix}@${SYNTHETIC_EMAIL_DOMAIN}`;
    username = `synthetic_automated_qa_${suffix}`;
    userId = await createCustomAccount(actor, {
      username,
      displayName: SYNTHETIC_MARKER,
      email,
      password,
      passwordConfirmation: password,
      accountPlan: FREE_SINGLE_PLAN,
      propertyAccessMode: "all",
      mustChangePassword: false
    }, { failureStage: options.failureStage });
  }
  return { userId, email, username, password, workspaceOwnerId: userId, marker: SYNTHETIC_MARKER };
}

export const SYNTHETIC_QA_MARKER = SYNTHETIC_MARKER;
