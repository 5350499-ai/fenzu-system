import type { ReminderItem } from "@/lib/reminder-engine";
import { ReminderRow } from "@/components/reminder-row";
import type { ReminderDisplayContext } from "@/lib/reminder-display";

export function HomepageReminderRow({ item, context }: { item: ReminderItem; context: ReminderDisplayContext }) {
  return <ReminderRow item={item} context={context} variant="compact" />;
}
