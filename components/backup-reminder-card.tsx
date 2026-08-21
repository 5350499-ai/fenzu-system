"use client";

import { useAccountAccess } from "@/components/account-access";
import { SectionCard } from "@/components/ui";
import { backupReminderLabel, loadBackupReminderSettings, loadServerBackupReminderSettings, nextBackupReminderAt, saveBackupReminderSettings, type BackupReminderFrequency, type BackupReminderSettings } from "@/lib/backup-reminders";
import { getValidSupabaseSession } from "@/lib/supabase";
import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";

export function BackupReminderCard() {
  const access = useAccountAccess();
  const [settings, setSettings] = useState<BackupReminderSettings>(() => loadBackupReminderSettings(""));

  useEffect(() => {
    if (!access.ready || !access.userId) return;
    void (async () => {
      const session = await getValidSupabaseSession();
      if (session) setSettings(await loadServerBackupReminderSettings(access.userId, session.access_token));
      else setSettings(loadBackupReminderSettings(access.userId));
    })();
  }, [access.ready, access.userId]);

  const nextReminder = settings.frequency === "never" ? null : nextBackupReminderAt(settings);
  return <SectionCard className="data-center-card">
    <div className="data-center-card-header"><div className="data-center-icon"><BellRing size={20} /></div><div><h2 className="panel-title">数据备份提醒</h2><p className="data-center-muted">打开蜜蜂分租时，根据最近一次成功备份时间，在提醒中心提醒你再次备份。</p></div></div>
    <div className="settings-list backup-reminder-settings">
      <label className="field"><span>提醒周期</span><select value={settings.frequency} onChange={(event) => {
        const frequency = event.target.value as BackupReminderFrequency;
        const next = { ...settings, frequency, firstEnabledAt: frequency === "never" ? settings.firstEnabledAt : settings.frequency === "never" ? new Date().toISOString() : settings.firstEnabledAt };
        setSettings(next);
        saveBackupReminderSettings(access.userId, next);
      }}><option value="never">不提醒</option><option value="monthly">每月提醒</option><option value="quarterly">每3个月提醒</option><option value="halfYearly">每6个月提醒</option></select></label>
      <div><span>提醒周期</span><strong>{backupReminderLabel(settings.frequency)}</strong></div>
      <div><span>最近备份</span><strong>{settings.lastSuccessfulBackupAt ? formatDateTime(settings.lastSuccessfulBackupAt) : "暂无可确认记录"}</strong></div>
      <div><span>下一次提醒</span><strong>{nextReminder ? formatDateTime(nextReminder.toISOString()) : "完成首次数据备份后开始计算提醒时间。"}</strong></div>
    </div>
  </SectionCard>;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
