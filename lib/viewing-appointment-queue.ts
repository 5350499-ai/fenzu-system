export type ViewingAppointmentQueueItem = {
  appointmentDate: string;
  appointmentTime?: string | null;
  status: string;
};

function appointmentDateTime(item: ViewingAppointmentQueueItem) {
  return `${item.appointmentDate}T${(item.appointmentTime || "00:00").slice(0, 5)}`;
}

export function appointmentQueueGroup(item: ViewingAppointmentQueueItem, today: string) {
  if (item.status === "待看房") return item.appointmentDate >= today ? 0 : 1;
  return 2;
}

export function sortViewingAppointments<T extends ViewingAppointmentQueueItem>(items: T[], today: string) {
  return [...items].sort((left, right) => {
    const leftGroup = appointmentQueueGroup(left, today);
    const rightGroup = appointmentQueueGroup(right, today);
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;
    const leftDateTime = appointmentDateTime(left);
    const rightDateTime = appointmentDateTime(right);
    if (leftGroup === 1) return rightDateTime.localeCompare(leftDateTime);
    return leftDateTime.localeCompare(rightDateTime);
  });
}

export function selectHomepageAppointments<T extends ViewingAppointmentQueueItem>(items: T[], today: string, limit = 3) {
  return sortViewingAppointments(items.filter((item) => item.status === "待看房"), today).slice(0, limit);
}
