export type BackupReminderFrequency = "never" | "monthly" | "quarterly" | "halfYearly";

export type BackupReminderSettings = {
  frequency: BackupReminderFrequency;
  firstEnabledAt: string;
  lastSuccessfulBackupAt: string;
};

const STORAGE_PREFIX = "fenzu-backup-reminder:";

export function defaultBackupReminderSettings(now = new Date().toISOString()): BackupReminderSettings {
  return { frequency: "monthly", firstEnabledAt: now, lastSuccessfulBackupAt: "" };
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadBackupReminderSettings(userId: string): BackupReminderSettings {
  const fallback = defaultBackupReminderSettings();
  if (typeof window === "undefined" || !userId) return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(userId)) || "null") as Partial<BackupReminderSettings> | null;
    const frequency = parsed?.frequency === "never" || parsed?.frequency === "monthly" || parsed?.frequency === "quarterly" || parsed?.frequency === "halfYearly"
      ? parsed.frequency : fallback.frequency;
    return {
      frequency,
      firstEnabledAt: typeof parsed?.firstEnabledAt === "string" && parsed.firstEnabledAt ? parsed.firstEnabledAt : fallback.firstEnabledAt,
      lastSuccessfulBackupAt: typeof parsed?.lastSuccessfulBackupAt === "string" ? parsed.lastSuccessfulBackupAt : ""
    };
  } catch {
    return fallback;
  }
}

export function saveBackupReminderSettings(userId: string, settings: BackupReminderSettings) {
  if (typeof window !== "undefined" && userId) window.localStorage.setItem(storageKey(userId), JSON.stringify(settings));
}

export function markSuccessfulBackup(userId: string, at = new Date().toISOString()) {
  const current = loadBackupReminderSettings(userId);
  const next = { ...current, lastSuccessfulBackupAt: at };
  saveBackupReminderSettings(userId, next);
  return next;
}

export async function loadServerBackupReminderSettings(userId: string, accessToken: string): Promise<BackupReminderSettings> {
  const local = loadBackupReminderSettings(userId);
  try {
    const response = await fetch("/api/data-backup/status", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { lastSuccessfulBackupAt?: unknown };
    if (!response.ok) return local;
    return { ...local, lastSuccessfulBackupAt: typeof payload.lastSuccessfulBackupAt === "string" ? payload.lastSuccessfulBackupAt : "" };
  } catch {
    return local;
  }
}

export async function recordSuccessfulBackup(accessToken: string): Promise<string> {
  const response = await fetch("/api/data-backup/complete", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({})) as { lastSuccessfulBackupAt?: unknown; error?: string };
  if (!response.ok || typeof payload.lastSuccessfulBackupAt !== "string") throw new Error(payload.error || "备份记录同步失败，请稍后刷新确认。");
  return payload.lastSuccessfulBackupAt;
}

export function isBackupReminderDue(settings: BackupReminderSettings, now = new Date()) {
  const dueAt = nextBackupReminderAt(settings);
  return Boolean(dueAt && now.getTime() >= dueAt.getTime());
}

export function nextBackupReminderAt(settings: BackupReminderSettings): Date | null {
  if (settings.frequency === "never" || !settings.lastSuccessfulBackupAt) return null;
  const baselineText = settings.lastSuccessfulBackupAt;
  const baseline = new Date(baselineText);
  if (!Number.isFinite(baseline.getTime())) return null;
  const dueAt = new Date(baseline);
  if (settings.frequency === "monthly") dueAt.setMonth(dueAt.getMonth() + 1);
  else if (settings.frequency === "quarterly") dueAt.setMonth(dueAt.getMonth() + 3);
  else dueAt.setMonth(dueAt.getMonth() + 6);
  return dueAt;
}

export function backupReminderLabel(frequency: BackupReminderFrequency) {
  return frequency === "never" ? "不提醒" : frequency === "monthly" ? "每月" : frequency === "quarterly" ? "每3个月" : "每6个月";
}
