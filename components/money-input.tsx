"use client";

import { useEffect, useState } from "react";

export function MoneyInput({
  label,
  value,
  onChange,
  readOnly,
  className,
  min = 0
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  readOnly?: boolean;
  className?: string;
  min?: number;
}) {
  const [text, setText] = useState(value ? String(value) : "");

  useEffect(() => {
    setText(value ? String(value) : "");
  }, [value]);

  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <label>{label}</label>
      <input
        inputMode="decimal"
        min={min}
        placeholder="请输入金额"
        readOnly={readOnly}
        step="0.01"
        type="number"
        value={text}
        onChange={(event) => {
          const nextText = normalizeMoneyText(event.target.value);
          setText(nextText);
          onChange(nextText === "" ? 0 : Number(nextText));
        }}
      />
    </div>
  );
}

function normalizeMoneyText(value: string) {
  if (!value) return "";
  const cleaned = value.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned.replace(/^0+(?=\d)/, "");
  const integerPart = cleaned.slice(0, firstDot).replace(/^0+(?=\d)/, "");
  const decimalPart = cleaned.slice(firstDot + 1).replace(/\./g, "");
  return `${integerPart || "0"}.${decimalPart.slice(0, 2)}`;
}
