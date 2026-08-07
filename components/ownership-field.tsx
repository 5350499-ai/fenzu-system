"use client";

export type OwnershipMode = string;

export function OwnershipField({
  label = "收款归属",
  mode,
  options,
  className,
  optionsLoading = false,
  onModeChange
}: {
  label?: string;
  mode: OwnershipMode;
  options: Array<{ value: string; label: string }>;
  className?: string;
  optionsLoading?: boolean;
  onModeChange: (mode: OwnershipMode) => void;
}) {
  return (
    <>
      <div className={`field${className ? ` ${className}` : ""}`}>
        <label>{label}</label>
        <select
          disabled={optionsLoading || !options.length}
          value={mode}
          onChange={(event) => onModeChange(event.target.value as OwnershipMode)}
        >
          {optionsLoading ? <option value="">正在加载合伙人…</option> : null}
          {!optionsLoading && options.length ? options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : null}
          {!optionsLoading && !options.length ? <option value="">暂无可用合伙人</option> : null}
        </select>
      </div>
    </>
  );
}
