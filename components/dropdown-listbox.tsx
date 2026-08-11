"use client";

import { ReactNode, useRef } from "react";
import {
  isDropdownTap,
  moveDropdownGesture,
  shouldContainDropdownOverscroll,
  startDropdownGesture,
  type DropdownGestureState
} from "@/lib/dropdown-gesture";

export type DropdownListboxOption = {
  value: string;
  label: string;
  description?: string;
};

export function DropdownListbox({
  id,
  className,
  optionClassName,
  emptyClassName,
  options,
  value,
  activeIndex = -1,
  emptyMessage = "暂无可选项",
  renderOption,
  onActiveIndexChange,
  onSelect
}: {
  id?: string;
  className: string;
  optionClassName: string;
  emptyClassName: string;
  options: DropdownListboxOption[];
  value: string;
  activeIndex?: number;
  emptyMessage?: string;
  renderOption?: (option: DropdownListboxOption) => ReactNode;
  onActiveIndexChange?: (index: number) => void;
  onSelect: (option: DropdownListboxOption) => void;
}) {
  const gestureRef = useRef<DropdownGestureState | null>(null);
  const suppressClickUntilRef = useRef(0);

  function canCommitSelection() {
    return Date.now() >= suppressClickUntilRef.current && isDropdownTap(gestureRef.current);
  }

  return (
    <div
      className={`${className} ui-dropdown-listbox`}
      data-ui-scroll-owner="dropdown"
      id={id}
      role="listbox"
      onTouchStart={(event) => {
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        gestureRef.current = startDropdownGesture(touch.clientX, touch.clientY);
        event.stopPropagation();
      }}
      onTouchMove={(event) => {
        if (event.touches.length !== 1 || !gestureRef.current) return;
        const touch = event.touches[0];
        const next = moveDropdownGesture(gestureRef.current, touch.clientX, touch.clientY);
        gestureRef.current = next.state;
        event.stopPropagation();
        if (shouldContainDropdownOverscroll(
          event.currentTarget.scrollTop,
          event.currentTarget.scrollHeight,
          event.currentTarget.clientHeight,
          next.deltaY
        )) event.preventDefault();
      }}
      onTouchEnd={(event) => {
        event.stopPropagation();
        if (gestureRef.current?.moved) suppressClickUntilRef.current = Date.now() + 450;
        gestureRef.current = null;
      }}
      onTouchCancel={(event) => {
        event.stopPropagation();
        suppressClickUntilRef.current = Date.now() + 450;
        gestureRef.current = null;
      }}
      onWheel={(event) => {
        event.stopPropagation();
        const list = event.currentTarget;
        const atTop = list.scrollTop <= 0;
        const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
        if ((atTop && event.deltaY < 0) || (atBottom && event.deltaY > 0)) event.preventDefault();
      }}
    >
      {options.length ? options.map((option, index) => (
        <button
          aria-selected={option.value === value}
          className={`${optionClassName}${option.value === value ? " selected" : ""}${index === activeIndex ? " active" : ""}`}
          id={id ? `${id}-${index}` : undefined}
          key={`${option.value}-${index}`}
          onClick={(event) => {
            event.stopPropagation();
            if (!canCommitSelection()) return;
            onSelect(option);
          }}
          onFocus={() => onActiveIndexChange?.(index)}
          role="option"
          type="button"
        >
          {renderOption ? renderOption(option) : <><strong>{option.label}</strong>{option.description ? <span>{option.description}</span> : null}</>}
        </button>
      )) : <div className={emptyClassName}>{emptyMessage}</div>}
    </div>
  );
}
