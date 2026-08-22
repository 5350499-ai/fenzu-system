"use client";

import type { InputHTMLAttributes } from "react";
import { useRef } from "react";
import { X } from "lucide-react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  visible?: boolean;
  clearLabel?: string;
};

export function PasswordInput({
  value,
  onValueChange,
  visible = false,
  clearLabel = "清空密码",
  disabled,
  ...inputProps
}: PasswordInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function clearValue() {
    onValueChange("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <span className="password-input">
      <input
        {...inputProps}
        ref={inputRef}
        type={visible ? "text" : "password"}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value && !disabled ? <button
        className="password-input-clear"
        type="button"
        aria-label={clearLabel}
        onPointerDown={(event) => event.preventDefault()}
        onClick={clearValue}
      >
        <X size={18} aria-hidden="true" />
      </button> : null}
    </span>
  );
}
