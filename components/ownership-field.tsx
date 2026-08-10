"use client";

import { useId } from "react";

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
  const inputId = useId();
  return (
    <>
      <div className={`field ui-ownership-field${className ? ` ${className}` : ""}`}>
        <label htmlFor={inputId}>{label}</label>
        <select
          className="ui-native-select"
          data-ui-control="single-line-select"
          disabled={optionsLoading || !options.length}
          id={inputId}
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
