import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Compatibility entry point: the live-schema validator is now the single
// column/mapping owner. Keep the old command name for existing CI callers.
const result = spawnSync(process.execPath, [fileURLToPath(new URL("./validate-restore-live-schema.mjs", import.meta.url))], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
