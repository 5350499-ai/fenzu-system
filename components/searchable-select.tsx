"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

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
  className,
  placeholder,
  disabled,
  openOnTouchWithoutKeyboard = true,
  onChange
}: {
  label: string;
  value: string;
  options: SelectOption[];
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Lets touch users open a long option list before the virtual keyboard takes screen space. */
  openOnTouchWithoutKeyboard?: boolean;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listboxId = useId();
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

  function openMenu() {
    setOpen(true);
    setActiveIndex((current) => current >= 0 && current < visibleOptions.length ? current : 0);
  }

  function closeMenu() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function chooseOption(option: SelectOption) {
    onChange(option.value);
    setQuery("");
    closeMenu();
  }

  function closeAfterFocusSettles() {
    requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (activeElement instanceof Node && rootRef.current?.contains(activeElement)) return;
      closeMenu();
    });
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        const fallback = event.key === "ArrowDown" ? -1 : visibleOptions.length;
        const next = (current < 0 ? fallback : current) + (event.key === "ArrowDown" ? 1 : -1);
        return Math.max(0, Math.min(visibleOptions.length - 1, next));
      });
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && open && visibleOptions[activeIndex]) {
      event.preventDefault();
      chooseOption(visibleOptions[activeIndex]);
    }
  }

  return (
    <div className={`field combobox-field${className ? ` ${className}` : ""}`} ref={rootRef}>
      <label htmlFor={inputId}>{label}</label>
      <div
        className={`combobox ui-combobox-control ${disabled ? "disabled" : ""}`}
        data-ui-control="composite-select"
        onMouseDown={(event) => {
          if (!disabled && event.target === event.currentTarget) openMenu();
        }}
        onTouchStart={(event) => {
          if (!disabled && event.target === event.currentTarget) openMenu();
        }}
      >
        <Search size={17} />
        <input
          id={inputId}
          className="ui-combobox-input"
          data-ui-composite-input
          disabled={disabled}
          aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          aria-controls={open ? listboxId : undefined}
          aria-expanded={open}
          aria-haspopup="listbox"
          onBlur={closeAfterFocusSettles}
          onChange={(event) => {
            setQuery(event.target.value);
            openMenu();
          }}
          onFocus={openMenu}
          onKeyDown={handleInputKeyDown}
          onPointerDown={(event) => {
            if (openOnTouchWithoutKeyboard && event.pointerType === "touch" && !open) {
              event.preventDefault();
              openMenu();
            }
          }}
          placeholder={selected ? selected.label : placeholder || "搜索并选择"}
          role="combobox"
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
          <div className="combobox-menu" id={listboxId} role="listbox">
            {visibleOptions.length ? (
              visibleOptions.map((option, index) => (
                <button
                  aria-selected={option.value === value}
                  className="combobox-option"
                  id={`${listboxId}-${index}`}
                  key={option.value}
                  onClick={() => chooseOption(option)}
                  onFocus={() => setActiveIndex(index)}
                  role="option"
                  type="button"
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
