"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { DropdownListbox, type DropdownListboxOption } from "@/components/dropdown-listbox";

export type TapSelectOption = DropdownListboxOption;

export function TapSelect({
  label,
  value,
  options,
  className,
  placeholder = "点这里选择",
  disabled,
  allowEmpty,
  onChange
}: {
  label: string;
  value: string;
  options: TapSelectOption[];
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);
  const resolvedClassName = className || (label.startsWith("房源") || label.startsWith("房间") || label.startsWith("租客") || label === "收款类型" ? "rent-form-wide" : "rent-form-half");
  const displayedOptions = allowEmpty
    ? [{ value: "", label: "不选择", description: "可直接留空" }, ...options]
    : options;

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  return (
    <div className={`field tap-select-field ${resolvedClassName}`} ref={rootRef} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <label htmlFor={triggerId}>{label}</label>
      <div className={`tap-select ${open ? "open" : ""} ${disabled ? "disabled" : ""}`}>
        <button
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listboxId : undefined}
          className="tap-select-trigger ui-custom-select-trigger"
          data-ui-control="composite-select-trigger"
          disabled={disabled}
          id={triggerId}
          onClick={() => { if (!disabled) setOpen((current) => !current); }}
          type="button"
        >
          <span><strong>{selected?.label || placeholder}</strong>{selected?.description ? <small>{selected.description}</small> : null}</span>
          <ChevronDown size={18} />
        </button>
        {open && !disabled ? (
          <DropdownListbox
            className="tap-select-menu"
            emptyClassName="tap-select-empty"
            id={listboxId}
            onSelect={(option) => { onChange(option.value); setOpen(false); }}
            optionClassName="tap-select-option"
            options={displayedOptions}
            value={value}
          />
        ) : null}
      </div>
    </div>
  );
}
