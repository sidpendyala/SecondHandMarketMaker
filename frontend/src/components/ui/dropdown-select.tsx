"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/utils";

export interface DropdownSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  /** Label for the empty value option (e.g. "Any"); when set, adds a selectable empty option */
  emptyOptionLabel?: string;
  /** Optional label for aria */
  "aria-label"?: string;
  className?: string;
  triggerClassName?: string;
  /** Smaller variant (e.g. for SmartFieldsForm) */
  size?: "sm" | "md";
}

export function DropdownSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  emptyOptionLabel,
  "aria-label": ariaLabel,
  className,
  triggerClassName,
  size = "md",
}: DropdownSelectProps) {
  const [open, setOpen] = React.useState(false);

  const displayLabel = value
    ? options.find((o) => o === value) ?? value
    : emptyOptionLabel ?? placeholder;

  const handleSelect = React.useCallback(
    (v: string) => {
      onValueChange(v);
      setOpen(false);
    },
    [onValueChange]
  );

  const isSm = size === "sm";

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenu.Trigger
        aria-label={ariaLabel}
        className={cn(
          "dropdown-select-trigger relative inline-flex w-full items-center justify-between gap-2 border border-[#2a2520] bg-black text-left text-[#e8e6e3] outline-none transition-colors hover:border-[#3d3832] focus:border-[#39ff14]/60 focus:ring-1 focus:ring-[#39ff14]/30",
          isSm ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 pr-8 text-xs",
          triggerClassName
        )}
      >
        <span className={cn("truncate", !value && "text-[#6b6560]")}>
          {displayLabel}
        </span>
        <ChevronDown
          className={cn(
            "shrink-0 text-[#6b6560] transition-transform duration-200",
            open && "rotate-180",
            isSm ? "h-3 w-3" : "absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2"
          )}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            "dropdown-select-content z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-hidden border border-[#2a2520] bg-[#0d0b09] py-1 shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
          sideOffset={4}
          align="start"
        >
          {emptyOptionLabel !== undefined && (
            <DropdownMenu.Item
              onSelect={() => handleSelect("")}
              className={cn(
                "dropdown-select-item relative flex cursor-pointer select-none items-center px-3 py-1.5 text-[#e8e6e3] outline-none transition-colors focus:bg-[#39ff14]/10 focus:text-[#39ff14] data-[highlighted]:bg-[#39ff14]/10 data-[highlighted]:text-[#39ff14]",
                isSm ? "text-[11px]" : "text-xs",
                !value && "bg-[#39ff14]/10 text-[#39ff14]"
              )}
            >
              {emptyOptionLabel}
            </DropdownMenu.Item>
          )}
          {options.map((opt) => (
            <DropdownMenu.Item
              key={opt}
              onSelect={() => handleSelect(opt)}
              className={cn(
                "dropdown-select-item relative flex cursor-pointer select-none items-center px-3 py-1.5 text-[#e8e6e3] outline-none transition-colors focus:bg-[#39ff14]/10 focus:text-[#39ff14] data-[highlighted]:bg-[#39ff14]/10 data-[highlighted]:text-[#39ff14]",
                isSm ? "text-[11px]" : "text-xs",
                value === opt && "bg-[#39ff14]/10 text-[#39ff14]"
              )}
            >
              {opt}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
