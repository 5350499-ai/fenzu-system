"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

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
  onChange
}: {
  label: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
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

  return (
    <div className="field combobox-field">
      <label>{label}</label>
      <div
        className={`combobox ${disabled ? "disabled" : ""}`}
        onMouseDown={() => {
          if (!disabled) setOpen(true);
        }}
        onTouchStart={() => {
          if (!disabled) setOpen(true);
        }}
      >
        <Search size={17} />
        <input
          disabled={disabled}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
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
              setOpen(false);
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
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(option.value);
                    setQuery("");
                    setOpen(false);
                  }}
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
