import { useId } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Switch — an accessible on/off toggle built on `<button role="switch">` (keyboard +
 * aria-checked come free). Two shapes:
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
}

function Track({ checked, disabled, id, labelledBy, ariaLabel, onToggle }: {
  checked: boolean;
  disabled?: boolean;
  id?: string;
  labelledBy?: string;
  ariaLabel?: string;
  onToggle: () => void;
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
        "relative inline-flex h-5 w-9 flex-none items-center rounded-full transition-colors " +
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
          "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-accent" : "bg-line",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute left-0.5 h-4 w-4 rounded-full bg-paper shadow-[var(--shadow-sm)] transition-transform",
          checked && "translate-x-4",
        )}
      />
    </button>
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
}: SwitchProps) {
  const genId = useId();
  const toggle = () => {
    if (!disabled) onCheckedChange(!checked);
  };

  if (label == null) {
    return (
      <Track checked={checked} disabled={disabled} id={id} ariaLabel={ariaLabel} onToggle={toggle} />
    );
  }

  const labelId = `${genId}-label`;
  return (
    <div className={cn("flex items-start justify-between gap-3", disabled && "opacity-60", className)}>
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
