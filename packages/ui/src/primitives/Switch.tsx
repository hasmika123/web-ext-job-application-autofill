"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Switch — an accessible on/off toggle, styled to match the web app's `ui/Switch`
 * (26×44 track, 20px `after:` thumb). Two shapes:
 *   - bare control: `<Switch checked={v} onCheckedChange={setV} aria-label="…" />`
 *   - labeled row:  `<Switch label="…" description="…" checked={v} onCheckedChange={setV} />`
 * In the labeled form the text sits left, the toggle right; clicking either toggles.
 */
export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Optional label — renders the full labeled-row layout. */
  label?: ReactNode;
  /** Optional helper text under the label. */
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

// The track — a 1:1 port of the web app's ui/Switch look (pseudo-element thumb).
function Track({ checked, disabled, id, labelledBy, ariaLabel, onToggle, className }: {
  checked: boolean;
  disabled?: boolean;
  id?: string;
  labelledBy?: string;
  ariaLabel?: string;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative h-[26px] w-[44px] flex-none rounded-full transition-colors duration-150 cursor-pointer",
        "after:absolute after:top-[3px] after:h-5 after:w-5 after:rounded-full after:bg-white",
        "after:shadow-[0_1px_3px_rgba(0,0,0,.2)] after:transition-[left] after:duration-150",
        checked ? "bg-accent after:left-[21px]" : "bg-line after:left-[3px]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
    />
  );
}

export default function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SwitchProps) {
  const genId = useId();
  const toggle = () => {
    if (!disabled) onCheckedChange(!checked);
  };

  if (label == null) {
    return (
      <Track
        checked={checked}
        disabled={disabled}
        id={id}
        ariaLabel={ariaLabel}
        labelledBy={ariaLabelledBy}
        onToggle={toggle}
        className={className}
      />
    );
  }

  const labelId = `${genId}-label`;
  return (
    <div className={cn("flex items-center justify-between gap-3", disabled && "opacity-60", className)}>
      <div className="min-w-0">
        <span
          id={labelId}
          onClick={toggle}
          className={cn("block text-[13.5px] font-medium leading-snug text-ink", !disabled && "cursor-pointer")}
        >
          {label}
        </span>
        {description != null && (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">{description}</span>
        )}
      </div>
      <Track checked={checked} disabled={disabled} id={id} labelledBy={labelId} onToggle={toggle} />
    </div>
  );
}
