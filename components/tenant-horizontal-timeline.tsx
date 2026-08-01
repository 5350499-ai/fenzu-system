"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { groupTimelineEventsByDate, TenantTimelineEvent } from "@/lib/tenant-timeline";
import { euro } from "@/lib/format";

function shortLabel(event: TenantTimelineEvent) {
  if (event.type === "房租收款") return event.delay?.included && event.delay.days > 0 ? `房租 · 迟交${event.delay.days}天` : event.delay?.included ? "房租 · 按时" : "房租 · 未统计";
  if (event.type === "续交房租") return event.delay?.included && event.delay.days > 0 ? `续租 · 迟交${event.delay.days}天` : event.delay?.included ? "续租 · 按时" : "续租 · 未统计";
  if (event.type === "押金") return "押金";
  if (event.type === "合同开始") return "合同";
  return event.title;
}

function toneClass(event: TenantTimelineEvent) {
  if (event.type === "当前逾期") return "current-overdue";
  if (event.delay?.included) return event.delay.days >= 10 ? "late-red" : event.delay.days > 0 ? "late-yellow" : "on-time";
  if (event.type === "房租收款" || event.type === "续交房租") return "untracked";
  return "neutral";
}

export function TenantHorizontalTimeline({ events }: { events: TenantTimelineEvent[] }) {
  const groups = useMemo(() => groupTimelineEventsByDate(events), [events]);
  const latestId = events[0]?.id || null;
  const [selectedId, setSelectedId] = useState<string | null>(latestId);
  const trackRef = useRef<HTMLDivElement>(null);
  const selected = events.find((event) => event.id === selectedId) || events[0] || null;

  useEffect(() => {
    setSelectedId(latestId);
    if (trackRef.current) trackRef.current.scrollLeft = trackRef.current.scrollWidth;
  }, [latestId, events.length]);

  return <div className="tenant-horizontal-timeline">
    <div className="tenant-timeline-track" ref={trackRef} aria-label="租客时间轴">
      <div className="tenant-timeline-track-inner">
        {groups.map((group) => <div className="tenant-timeline-date-group" key={group.date}>
          <time>{group.date}</time>
          <div className="tenant-timeline-date-events">
            {group.events.map((event) => <button className={`tenant-timeline-node ${toneClass(event)}${selected?.id === event.id ? " selected" : ""}`} key={event.id} type="button" onClick={() => setSelectedId(event.id)} aria-pressed={selected?.id === event.id}>
              <span className="tenant-timeline-dot" aria-hidden="true" />
              <span>{shortLabel(event)}</span>
            </button>)}
          </div>
        </div>)}
      </div>
    </div>
    {selected ? <TimelineEventDetails event={selected} /> : <div className="muted">暂无时间轴记录</div>}
  </div>;
}

function TimelineEventDetails({ event }: { event: TenantTimelineEvent }) {
  const payment = event.payment;
  return <div className="tenant-timeline-selected">
    <strong>{event.title}</strong>
    <span>日期：{event.date}</span>
    {payment ? <>
      <span>实际收款：{payment.paymentDate || "未记录"}</span>
      <span>房租：{euro(payment.amountDue)}</span>
      <span>押金：{euro(event.depositAmount || 0)}</span>
      <span>实收：{euro(payment.amountPaid)}</span>
      <span>覆盖：{payment.coverageStartDate || "-"} 至 {payment.coverageEndDate || "-"}</span>
      <span>应收日期：{event.delay?.dueDate || "未确定"}</span>
      <span>{event.delay?.included ? event.delay.days > 0 ? `迟交${event.delay.days}天` : "按时付款" : "未纳入迟交统计"}</span>
    </> : event.detail ? <span>{event.detail}</span> : null}
  </div>;
}
