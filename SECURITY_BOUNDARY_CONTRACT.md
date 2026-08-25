# Security Boundary Contract

Status: `SECURITY_7X_COMPLETE_WITH_DEFERRED_RISKS`

This is the single governance owner for authentication, authorization, account
isolation and sensitive-operation boundaries. It complements the Action Tree,
Data State, Domain Rule, Server Boundary and Responsive contracts.

## Security ownership layers

```text
Supabase Auth identity
  -> server session verification
  -> user_profiles account identity
  -> role/module/sensitive permissions
  -> resource/property ownership
  -> API/service/RPC/RLS boundary
  -> scoped data or storage operation
```

The browser may display auth state and permission-derived UI, but it is never
the authority for user ID, account ID, role, permission, ownership or admin
status.

## Security Boundary Registry

`SECURITY_BOUNDARY_REGISTRY` covers every current API route:

```text
/api/accounts
/api/accounts/[id]
/api/accounts/[id]/security
/api/accounts/[id]/share-login
/api/accounts/me
/api/workspace/currency
/api/admin/attachments/cleanup
/api/admin/attachments/cleanup-candidates
/api/admin/attachments/export
/api/admin/attachments/inventory
/api/admin/attachments/summary
/api/admin/google-attachment-migration/run
/api/admin/google-attachment-migration/scan
/api/admin/recovery-health
/api/admin/recovery-points
/api/audit-logs
/api/auth/change-password
/api/auth/forgot-password
/api/auth/login
/api/auth/logout
/api/auth/register
/api/auth/restore-session
/api/auth/revoke-after-recovery
/api/auth/verification-status
/api/business-data
/api/check-in
/api/check-in/receipt-links
/api/client-errors
/api/data-backup
/api/data-backup/status
/api/data-backup/complete
/api/data-restore
/api/data-restore/current-summary
/api/debug/backup-trace
/api/files/google-drive/complete
/api/files/google-drive/content
/api/files/google-drive/delete
/api/files/google-drive/prepare
/api/files/google-drive/upload
/api/files/signed-url
/api/files/supabase-storage/complete
/api/files/supabase-storage/prepare
/api/partners
/api/partners/[id]
/api/partners/shares
/api/partner-settlements
/api/partner-settlements/[id]
/api/performance-timing/home
/api/performance-timing/login
/api/performance-timing/expense
/api/rent-collection
/api/rent-payments/lifecycle
/api/internal/recovery-scheduler
/api/tasks/migration
/api/tasks/migration-preview
/api/tasks/server
/api/tenants/move-room
/api/tenants/move-out
/api/tenants/create
```

| Security ID | Domain / entry | Auth | Session source | Scope/permission owner | Resource check | Risk/status |
|---|---|---|---|---|---|---|
| `SEC.AUTH.LOGIN` | `/api/auth/login` | public auth flow | Supabase Auth | server account provisioning | identity lookup | CANONICAL_AUTH |
| `SEC.AUTH.LOGOUT` | `/api/auth/logout` | required | bearer + app session | account-auth | current user session | CANONICAL_AUTH |
| `SEC.AUTH.SESSION` | `account-access`, `lib/supabase` | client view | persisted Supabase session | server `/api/accounts/me` | server revalidation | CLIENT_SESSION_VIEW |
| `SEC.AUTH.SERVER` | `requireActiveAccount` | required | `auth.getUser(token)` | user profile binding | session/revocation checks | SERVER_SESSION_AUTHORITY |
| `SEC.AUTH.RECOVERY` | password/recovery routes | flow-specific | recovery token/session | Supabase Auth + server revoke | current identity | HIGH_RISK |
| `SEC.ACCOUNT.IDENTITY` | `user_profiles` | required | authenticated user ID | workspace owner binding | profile status | CANONICAL_AUTH |
| `SEC.PERMISSION.MODULE` | `requireModulePermission` | required | server context | `user_permissions` | current user | PERMISSION_ROOT |
| `SEC.PERMISSION.SENSITIVE` | `requireSensitivePermission` | required | server context | sensitive permission table | current user | PERMISSION_ROOT |
| `SEC.PERMISSION.PROPERTY` | `requirePropertyAccess` | required | server context | `user_property_access` | property ID | PERMISSION_ROOT |
| `SEC.PERMISSION.OWNER` | owner-only/admin routes | required | server context | account type + managed plan | workspace owner | ADMIN_SERVER_GUARDED |
| `SEC.RESOURCE.PROPERTY` | property routes/business-data | required | server context | account-auth + RLS | property owner/access | OWNERSHIP_VERIFIED |
| `SEC.RESOURCE.TENANT` | tenant/check-in/move-room/move-out | required | server context | property + account | tenant/property relation | PARENT_OWNERSHIP_VERIFIED |
| `SEC.RESOURCE.ROOM` | room/move-room/move-out | required | server context | property + account | room/property relation | PARENT_OWNERSHIP_VERIFIED |
| `SEC.RESOURCE.FINANCIAL` | payment/deposit/expense | required | server context | property/account | payment parent scope | OWNERSHIP_VERIFIED |
| `SEC.RESOURCE.PARTNER` | partner/share/settlement | required | server context | workspace owner | partner/property scope | OWNERSHIP_VERIFIED |
| `SEC.RESOURCE.ATTACHMENT` | file prepare/read/complete/delete | required | bearer + ticket | parent + sensitive permission | parent and workspace | OWNERSHIP_VERIFIED |
| `SEC.RESOURCE.BACKUP` | backup/restore | owner-only | server context | owner + sensitive permission | workspace target | ADMIN_SERVER_GUARDED |
| `SEC.ADMIN.ATTACHMENT` | admin cleanup/inventory/export | required | server context | managed + settings permission | workspace | ADMIN_SERVER_GUARDED |
| `SEC.ADMIN.MIGRATION` | Google migration scan/run | required | server context | managed + settings permission | workspace + preview token | ADMIN_SERVER_GUARDED |
| `SEC.ADMIN.ACCOUNT` | account management/security | owner-only | server context | owner account boundary | target workspace | ADMIN_SERVER_GUARDED |
| `SEC.SECRET.SERVER` | service role/Google credentials | server-only | environment | server modules | n/a | SERVER_ONLY_SECRET |
| `SEC.STORAGE.CACHE` | localStorage/IndexedDB/cache | client | account user ID | cache manager/account key | logout/switch clear | DEFERRED_P1_REVIEW |
| `SEC.ERROR` | API/logging/client reporter | varies | server context | redaction helper | no secret response | SECURE_ERROR_CONTRACT |
| `SEC.REDIRECT` | login/recovery redirects | flow-specific | request/config | internal path/origin allowlist | URL validation | GUARDED |

## Authentication contract

- Supabase Auth is the identity provider and `auth.getUser(accessToken)` is the
  server identity check for authenticated API routes.
- `user_profiles.auth_user_id` binds Auth identity to application account;
  `workspace_owner_id` is derived from that server profile, never accepted as
  client authority.
- `requireActiveAccount` rejects missing/invalid tokens, disabled profiles,
  revoked sessions and invalid custom-account sessions.
- Owners use the existing session-revocation timestamp guard; custom accounts
  additionally require an active `app_sessions` row.
- Client `getSession()`/`onAuthStateChange()` is presentation and refresh
  coordination only. `isServerVerified` comes from `/api/accounts/me`.
- Logout and account switching clear the account-access snapshot and the cache
  manager reacts to account changes. The legacy unscoped diff-baseline key stays
  deferred and must not be treated as an auth authority.
- Passwords are sent only to the intended auth endpoints and are not stored in
  application storage or audit data. Password reset removes the URL fragment
  after Supabase consumes it and revokes the recovery session.

## Authorization and permission matrix

| Resource | Owner | Custom account | Server owner |
|---|---|---|---|
| Property/Room/Tenant/Contract | full module access | module permission + property access | `requireModulePermission` + `requirePropertyAccess` |
| Rent Payment/Deposit/Expense | full permitted access | module permission + property access | API/action boundary |
| Reminder | derived/read/action permission | same account-scoped action path | Action/Data State contracts |
| Task | task module permission | task module permission + property rules | task management service |
| Partner self-directory | owner/sensitive access | free-single may read only its Auth-linked self member and edit its display name | partner routes scope by workspace + linked account |
| Partner/Share/Settlement administration | owner/sensitive access | sensitive permission and workspace scope; free-single denied | partner/share/settlement routes |
| Attachment | module + sensitive permission | same plus file-specific sensitive permission | parent ownership + ticket |
| Backup/Restore | owner + managed + sensitive permission | denied by managed-account boundary | backup/restore route |
| Account management | owner only | denied | `requireActiveAccount(..., true)` |
| Admin cleanup/migration | managed + sensitive permission | free-single/managed restrictions | `requireManagedAccount` + sensitive permission |

UI capability checks are convenience only. Every business API revalidates
authentication, account scope, module/sensitive permission and resource
ownership as applicable.

## Account isolation and IDOR contract

| Identifier | Client may provide | Server requirement |
|---|---|---|
| `userId` / `accountId` | selector/input only | derive from Auth/profile; never trust role or ownership claims |
| `workspaceOwnerId` | no authority | derive from `user_profiles` |
| `propertyId` | yes | `requirePropertyAccess` or owner-scoped server query |
| `roomId` / `tenantId` | yes | parent relation and scoped query/RLS |
| payment/deposit/expense IDs | yes | authenticated scoped read before mutation |
| partner ID | yes | workspace owner filter; free-single additionally requires its Auth-linked self member and display-name-only PATCH |
| share/settlement IDs | yes | workspace owner filter and sensitive permission |
| attachment ID/path | yes | parent record/ticket/workspace verification; path is not authority |
| backup/restore identity | yes | owner-only server target and restore mapping |

No P0 cross-account read/write path was proven by this static audit. No production data
was queried or used for proof. Any future `CROSS_ACCOUNT_READ_RISK`,
`CROSS_ACCOUNT_WRITE_RISK`, `IDOR_RISK` or `RESOURCE_OWNERSHIP_GAP` is a P0
stop-the-line review item.

## Admin boundary map

| Boundary | Current classification |
|---|---|
| `/api/admin/attachments/*` | ADMIN_SERVER_GUARDED |
| `/api/admin/google-attachment-migration/*` | ADMIN_SERVER_GUARDED |
| `/api/data-backup`, `/api/data-backup/status`, `/api/data-backup/complete` and `/api/data-restore` | ADMIN_SERVER_GUARDED |
| `/api/accounts*` | ADMIN_SERVER_GUARDED |
| `/debug/*` and `/api/debug/*` | NON_PRODUCTION_ONLY / middleware guarded |
| visible admin pages | UI convenience only; API remains authoritative |

No destructive admin route was found to rely only on a hidden button. Debug
backup trace is allowlisted and returns 404 in Production; it is not a business
data endpoint.

## Secret and environment boundary

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public
  client configuration, not authorization secrets.
- `SUPABASE_SERVICE_ROLE_KEY`, Google client secret/refresh token, and storage
  signing material are only referenced by server-only modules or API routes.
- No client component imports a server secret module as a runtime import.
  Existing `import type` references are erased and carry no secret.
- `sanitizeAuditData` redacts password, token, authorization, cookie, secret,
  service-role and API-key-shaped fields.
- Client error reporting redacts bearer/token/password/cookie values before
  transport. No real secret values are included in this contract or tests.

### Synthetic QA account bootstrap

- `bootstrapSyntheticQaAccount` is a server-only wrapper around the canonical
  custom-account bootstrap; it does not create `auth.users` in isolation.
- `SYNTHETIC_QA_BOOTSTRAP_ENABLED` defaults to disabled. The wrapper also
  requires the server-only `SYNTHETIC_QA_BOOTSTRAP_SECRET` and generates the
  synthetic identity, email and password internally.
- The wrapper forces the `free_single` plan and `SYNTHETIC AUTOMATED QA`
  marker. It accepts no caller-supplied email, password, workspace, role or
  permissions, and it never returns credentials through an HTTP response.
- After Auth creation, profile, identity, module permissions, sensitive
  permissions and audit records use the existing canonical account service.
  Failure compensation removes dependent application rows before attempting
  Auth deletion; failure injection is unavailable in Production.
- The service-role key is limited to this server-side account bootstrap. All
  later synthetic business QA must use the synthetic user's normal password
  sign-in session and must remain outside the service-role path.

## Client storage and cache security

| Storage | Classification | Contract |
|---|---|---|
| account-access v3 snapshots | account-scoped UI permission snapshot | keyed by Auth user ID; server reverified |
| business/cache manager | account-scoped business cache | cache manager owns IndexedDB lifecycle and account clear |
| backup reminder/preferences/theme | non-sensitive or user-scoped UI state | not an auth authority |
| Supabase session | AUTH_STATE | Supabase client persistence; never copied into app snapshots |
| legacy diff-baseline | LEGACY_COMPATIBILITY | deferred account-isolation migration |

Passwords, service-role keys, refresh tokens and business authorization claims
must not be added to localStorage/IndexedDB snapshots.

## Attachment and backup/restore security

Attachment routes require authenticated context, module permission and the
relevant sensitive permission. Prepare and complete validate parent records;
completion verifies the HMAC ticket, workspace owner, tenant/contract relation,
file type/size and storage object metadata. Signed URL and delete paths resolve
the attachment record through the authenticated verifier before acting.

Tickets are server-signed and expire. Client-supplied path is not an ownership
authority. No cleanup or migration was executed in this audit.

Backup/restore is owner-only, managed-account-only where required and guarded by
sensitive permissions. Dry-run, before-restore backup, restore RPC and mapping
validation remain the canonical safety boundary. No real restore was executed.

## Request, injection and rendering contract

- Business reads/writes use Supabase query builders or registered RPCs; no raw
  SQL string execution was found in application routes.
- User text renders through ordinary React text interpolation. The only
  `dangerouslySetInnerHTML` occurrence is the static theme bootstrap script in
  `app/layout.tsx`, with no user input.
- Login `returnTo` accepts only an internal path beginning with `/` and not
  `//`; recovery/email origins pass an explicit trusted-origin allowlist.
- State-changing business actions use POST/PATCH/DELETE; no destructive GET
  route was found by the static audit.
- File MIME/type/size and signed-ticket boundaries are server validated.

## CSRF, errors, headers and abuse

- Business APIs authenticate with an explicit bearer token rather than a
  browser-authenticated cookie, so the normal business mutation path is
  `CSRF_NOT_APPLICABLE`; the verification cookie is `HttpOnly`, `SameSite=Lax`
  and secure in Production.
- API errors use the existing `AccountApiError` normalization. Raw secrets,
  tokens and stack traces are not returned as the user-facing error contract.
- No CSP, frame-ancestors, Permissions-Policy or Referrer-Policy configuration
  was found in the repository. This is a P2 deployment hardening recommendation
  and is deferred to avoid breaking Supabase, Storage, OAuth or Preview flows.
- Auth registration has an in-memory rate limit and Supabase provides auth
  provider controls. Other bulk/admin rate limits remain a recommendation;
  pending, permission and idempotency contracts remain the current protection.

## Deferred risk register

- `SEC.STORAGE.DIFF_BASELINE`: P1, legacy localStorage namespace is not fully
  account-isolated; migration requires compatibility design.
- `SEC.HEADER.HARDENING`: P2, security headers need deployment-aware review.
- `SEC.DEPENDENCY.AUDIT`: dependency audit reported 4 high advisories in the
  current production dependency graph (`next` direct, plus `nanoid`, `postcss`
  and `sharp` transitively). No force-fix or major upgrade is authorized in
  this governance step; remediation requires dependency compatibility review.
- `SEC.AUTH.CSRF_REVIEW`: P2, bearer/API and recovery-cookie paths should be
  rechecked if authentication changes to cookie-authenticated mutations.
- `SEC.RESOURCE.COMPATIBILITY`: P2, full-row `business-data` and `v1-*` aliases
  require caller-by-caller migration before stricter field ownership.
- Financial/lifecycle idempotency risks remain owned by Step 3/6 contracts and
  are not silently reclassified here.

## Regression vocabulary and final status

The following anti-patterns are forbidden: `CLIENT_TRUSTED_ACCOUNT_AUTHORITY`,
`CLIENT_TRUSTED_ROLE`, `UI_ONLY_SECURITY`, `DIRECT_SECRET_TO_CLIENT`,
`UNGUARDED_ADMIN_WRITE`, `CROSS_ACCOUNT_RESOURCE_LOOKUP`, `DESTRUCTIVE_GET`,
`OPEN_REDIRECT`, `UNSCOPED_ATTACHMENT_DELETE`, `RAW_SECRET_LOGGING` and
`UNREGISTERED_SECURITY_OWNER`.

`SECURITY_7X_COMPLETE_WITH_DEFERRED_RISKS`
