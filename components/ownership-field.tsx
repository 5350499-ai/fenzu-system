"use client";

export type OwnershipMode = "A" | "B" | "自定义";

export function OwnershipField({
  label = "收款归属",
  mode,
  customName,
  onModeChange,
  onCustomNameChange
}: {
  label?: string;
  mode: OwnershipMode;
  customName: string;
  onModeChange: (mode: OwnershipMode) => void;
  onCustomNameChange: (name: string) => void;
}) {
  return (
    <>
      <div className="field">
        <label>{label}</label>
        <select
          value={mode}
          onChange={(event) => onModeChange(event.target.value as OwnershipMode)}
        >
          <option value="A">A</option>
          <option value="B">B</option>
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
