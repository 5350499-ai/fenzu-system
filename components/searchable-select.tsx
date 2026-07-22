"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
};

export function SearchableSelect({
  label,
  value,
  options,
  placeholder,
  disabled,
  openOnTouchWithoutKeyboard,
  onChange
}: {
  label: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Lets touch users open a long option list before the virtual keyboard takes screen space. */
  openOnTouchWithoutKeyboard?: boolean;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectingRef = useRef(false);
  const selected = options.find((option) => option.value === value);
  const visibleOptions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const matched = keyword
      ? options.filter((option) =>
          `${option.label} ${option.description || ""} ${option.keywords || ""}`.toLowerCase().includes(keyword)
        )
      : options;
    return matched.slice(0, 8);
  }, [options, query]);

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

  function closeMenu() {
    setOpen(false);
  }

  function chooseOption(option: SelectOption, event: React.SyntheticEvent) {
    // Select before the input can blur. This keeps iOS touch selection independent
    // from virtual-keyboard focus and from the outside-click listener.
    event.preventDefault();
    event.stopPropagation();
    if (selectingRef.current) return;
    selectingRef.current = true;
    onChange(option.value);
    setQuery("");
    closeMenu();
    requestAnimationFrame(() => {
      selectingRef.current = false;
    });
  }

  return (
    <div className="field combobox-field" ref={rootRef}>
      <label>{label}</label>
      <div
        className={`combobox ${disabled ? "disabled" : ""}`}
        onMouseDown={(event) => {
          if (!disabled && event.target === event.currentTarget) setOpen(true);
        }}
        onTouchStart={(event) => {
          if (!disabled && event.target === event.currentTarget) setOpen(true);
        }}
      >
        <Search size={17} />
        <input
          disabled={disabled}
          onBlur={(event) => {
            if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
            closeMenu();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onPointerDown={(event) => {
            if (openOnTouchWithoutKeyboard && event.pointerType === "touch" && !open) {
              event.preventDefault();
              setOpen(true);
            }
          }}
          placeholder={selected ? selected.label : placeholder || "搜索并选择"}
          value={open ? query : selected?.label || ""}
        />
          {value ? (
            <button
              aria-label="清空"
              className="icon-button"
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onChange("");
                setQuery("");
                closeMenu();
              }}
            >
              <X size={15} />
          </button>
        ) : null}
        {open && !disabled ? (
          <div className="combobox-menu">
            {visibleOptions.length ? (
              visibleOptions.map((option) => (
                <button
                  className="combobox-option"
                  key={option.value}
                  type="button"
                  onPointerDown={(event) => chooseOption(option, event)}
                  onTouchStart={(event) => chooseOption(option, event)}
                >
                  <strong>{option.label}</strong>
                  {option.description ? <span>{option.description}</span> : null}
                </button>
              ))
            ) : (
              <div className="combobox-empty">没有匹配结果</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
