import Link from "next/link";
import { DebtRow } from "@/components/debt-row";
import type { ReminderItem } from "@/lib/reminder-engine";

export function HomepageReminderRow({ item }: { item: ReminderItem }) {
  if (item.debtCase) {
    return <DebtRow
      className={`reminder-item ${item.tone} rent-reminder`}
      debtCase={item.debtCase}
      href={item.href}
      variant="homepage"
    />;
  }

  return <Link className={`reminder-item homepage-reminder-row ${item.tone}`} href={item.href}>
    <span className="debt-row-primary homepage-reminder-primary"><strong>{item.title}</strong></span>
    <small className="debt-row-secondary">{item.description}</small>
  </Link>;
}
