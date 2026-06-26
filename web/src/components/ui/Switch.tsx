import { cn } from "@/lib/cn";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  /** Accessible name when there's no visible <label htmlFor>. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

/** Toggle switch (ported from the mockup `.switch`). Controlled: pass `checked` + `onCheckedChange`. */
export default function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  className,
  ...aria
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative h-[26px] w-[44px] flex-none rounded-full transition-colors duration-150 cursor-pointer",
        "after:absolute after:top-[3px] after:h-5 after:w-5 after:rounded-full after:bg-white",
        "after:shadow-[0_1px_3px_rgba(0,0,0,.2)] after:transition-[left] after:duration-150",
        checked ? "bg-accent after:left-[21px]" : "bg-line after:left-[3px]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      {...aria}
    />
  );
}
