"use client";

export type DateFilterPreset = "all" | "today" | "this_month" | "last_month" | "custom";

export type DateRange = {
  startDate: string;
  endDate: string;
};

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateRangeForPreset(preset: Exclude<DateFilterPreset, "custom">): DateRange {
  const now = new Date();
  if (preset === "all") return { startDate: "", endDate: "" };
  if (preset === "today") {
    const today = localDateString(now);
    return { startDate: today, endDate: today };
  }

  const month = new Date(now.getFullYear(), now.getMonth() + (preset === "last_month" ? -1 : 0), 1);
  return {
    startDate: localDateString(month),
    endDate: localDateString(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  };
}

export function dateRangeForMonth(month: string): DateRange | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || monthNumber < 1 || monthNumber > 12) return null;
  const start = new Date(year, monthNumber - 1, 1);
  return {
    startDate: localDateString(start),
    endDate: localDateString(new Date(year, monthNumber, 0))
  };
}

export function isDateInRange(date: string, range: DateRange) {
  if (!date) return !range.startDate && !range.endDate;
  return (!range.startDate || date >= range.startDate) && (!range.endDate || date <= range.endDate);
}

const labels: Record<DateFilterPreset, string> = {
  all: "全部时间",
  today: "今天",
  this_month: "本月",
  last_month: "上月",
  custom: "自定义日期范围"
};

export function DateRangeFilter({
  preset,
  startDate,
  endDate,
  onPresetChange,
  onStartDateChange,
  onEndDateChange
}: {
  preset: DateFilterPreset;
  startDate: string;
  endDate: string;
  onPresetChange: (preset: DateFilterPreset) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}) {
  return (
    <div className="date-range-filter">
      <label className="date-range-preset">
        <span>日期筛选</span>
        <select aria-label="日期筛选" value={preset} onChange={(event) => onPresetChange(event.target.value as DateFilterPreset)}>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {preset === "custom" ? (
        <div className="date-range-inputs">
          <label>开始日期<input aria-label="开始日期" type="date" value={startDate} max={endDate || undefined} onChange={(event) => onStartDateChange(event.target.value)} /></label>
          <label>结束日期<input aria-label="结束日期" type="date" value={endDate} min={startDate || undefined} onChange={(event) => onEndDateChange(event.target.value)} /></label>
        </div>
      ) : null}
      {preset !== "all" && startDate && endDate ? <span className="date-range-summary">{startDate} 至 {endDate}</span> : null}
    </div>
  );
}
