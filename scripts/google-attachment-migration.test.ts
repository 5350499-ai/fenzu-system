import assert from "node:assert/strict";
import { buildGoogleMigrationTargetPath, migrationTableSelect, sha256Hex } from "../lib/google-attachment-migration-rules";

assert.equal(migrationTableSelect.contract_files.includes("rent_payment_id"), false);
assert.equal(migrationTableSelect.rent_payment_files.includes("contract_id"), false);
assert.equal(migrationTableSelect.expense_files.includes("expense_id"), true);

assert.equal(
  buildGoogleMigrationTargetPath("workspace", "contract_files", "parent", "attachment", "photo.jpg", "image/jpeg"),
  "workspace/migrated/contract_files/parent/attachment.jpg"
);
assert.equal(
  buildGoogleMigrationTargetPath("workspace", "rent_payment_files", null, "attachment", "receipt", "application/pdf"),
  "workspace/migrated/rent_payment_files/unlinked/attachment.pdf"
);
assert.equal(
  buildGoogleMigrationTargetPath("workspace", "expense_files", "parent", "attachment", "photo", "image/png"),
  "workspace/migrated/expense_files/parent/attachment.png"
);
assert.equal(sha256Hex(new TextEncoder().encode("migration-test")), "7989010b9d9a399930896f835ee47408a0a6c6737a48a0d67d918dd18f4658ed");
console.log("google attachment migration target path tests passed");
