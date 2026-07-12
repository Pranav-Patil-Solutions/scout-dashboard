"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[12px] font-medium text-ink-2">
        {label}
        {required && <span className="text-primary"> *</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

type NativeSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "size"> & {
  onChange?: (value: string) => void;
  size?: "sm" | "md";
};

export function NativeSelect({
  value,
  onChange,
  children,
  className,
  size = "md",
  ...rest
}: NativeSelectProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          "w-full appearance-none rounded-lg border border-input bg-white/[0.02] pr-8 text-sm text-foreground outline-none transition-colors hover:border-white/15 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50",
          size === "sm" ? "h-8 pl-2.5" : "h-9 pl-3",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
    </div>
  );
}
