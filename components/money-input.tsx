"use client";

import { useEffect, useState } from "react";

export function MoneyInput({
  label,
  value,
  onChange,
  readOnly
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  readOnly?: boolean;
}) {
  const [text, setText] = useState(value ? String(value) : "");

  useEffect(() => {
    setText(value ? String(value) : "");
  }, [value]);

  return (
    <div className="field">
      <label>{label}</label>
      <input
        inputMode="decimal"
        min="0"
        placeholder="请输入金额"
        readOnly={readOnly}
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
  const [integerPart, decimalPart] = value.replace(/[^\d.]/g, "").split(".");
  const integer = integerPart.replace(/^0+(?=\d)/, "");
  if (decimalPart === undefined) return integer;
  return `${integer || "0"}.${decimalPart.slice(0, 2)}`;
}
