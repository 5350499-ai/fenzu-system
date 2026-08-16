# Closed Beta Data Inventory

This is an engineering inventory, not legal advice. Collect only data needed for the selected rental-management workflow.

| Category | Canonical owner | Ordinary user required? | Archive/delete behavior | Included in JSON backup? | Logs |
| --- | --- | --- | --- | --- | --- |
| Account email/username | Supabase Auth + `user_profiles` / `account_auth_identities` | Email is required for normal registration; username is account identity | Account disable preserves history; permanent account deletion is separate scope | Account-scoped metadata only, not secrets | Masked identity in operational records |
| Tenant name | `tenants.name` | Name required | Move-out/archive preserves history | Yes | Avoid full value in runtime logs |
| Phone / email | `tenants.phone`, `tenants.email` | Optional | Preserved with tenant history | Yes when present | No payload logging |
| WeChat / WhatsApp | `tenants.wechat`, `tenants.whatsapp` | Optional | Preserved with tenant history | Yes when present | No payload logging |
| Passport / NIE | `tenants.passport_number`, `tenants.nie_number` | Optional, not required by current form | Preserved with tenant record; no ordinary attachment upload | Yes when present; high-sensitivity field | Must not enter logs |
| Tenant notes | `tenants.notes`, `tenant_notes.content` | Optional | Preserved; user controls content | Yes when in official export scope | Treat as potentially sensitive; no values in logs |
| Property address/city | `properties.address`, `properties.city` | Name required; address optional | Archive marker preserves record | Yes | Do not log full address |
| Contract/rent | `contracts`, `rent_payments` | Depends on workflow | Historical records preserved; void/archive semantics apply | Yes | Log IDs/status only |
| Deposit | `deposits` | Optional workflow | Historical transaction preserved | Yes | Log IDs/status only |
| Expense | `expenses` | Optional workflow | Historical transaction preserved/void semantics | Yes | Log IDs/status only |
| Audit log | `audit_logs` | System-generated | Retained by policy; not user business data | Restricted/server-owned scope | Sanitized summaries only |
| Recovery metadata | `account_recovery_points`, scheduler runs | System-generated | Retention/eligibility rules; payload private | Metadata only in support views | No payload, token or secret |
| Attachments | Restricted file tables/Storage providers | Closed Beta ordinary users: not available | Managed/admin boundary only | Ordinary JSON backup excludes binary | Never log file contents or signed URLs |

Current audit found no tenant phone/email/passport/NIE field forced as a required ordinary-user input. Notes are intentionally free text; users should avoid storing unnecessary identity documents or secrets there.
