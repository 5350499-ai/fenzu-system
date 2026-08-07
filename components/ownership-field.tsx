"use client";

export type OwnershipMode = string;

export function OwnershipField({
  label = "收款归属",
  mode,
  customName,
  options,
  className,
  optionsLoading = false,
  onModeChange,
  onCustomNameChange
}: {
  label?: string;
  mode: OwnershipMode;
  customName: string;
  options?: Array<{ value: string; label: string }>;
  className?: string;
  optionsLoading?: boolean;
  onModeChange: (mode: OwnershipMode) => void;
  onCustomNameChange: (name: string) => void;
}) {
  return (
    <>
      <div className={`field${className ? ` ${className}` : ""}`}>
        <label>{label}</label>
        <select
          disabled={optionsLoading}
          value={mode}
          onChange={(event) => onModeChange(event.target.value as OwnershipMode)}
        >
          {optionsLoading ? <option value="">正在加载合伙人…</option> : null}
          {!optionsLoading && options?.length ? options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : null}
          {!optionsLoading && !options ? [{ value: "A", label: "A" }, { value: "B", label: "B" }].map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : null}
          <option value="自定义">自定义</option>
        </select>
      </div>
      {mode === "自定义" ? (
        <div className="field">
          <label>自定义归属名称</label>
          <input
            autoComplete="off"
            maxLength={50}
            placeholder="例如：现金、哈哈、朋友代收、工商银行"
            required
            value={customName}
            onChange={(event) => onCustomNameChange(event.target.value)}
          />
        </div>
      ) : null}
    </>
  );
}
