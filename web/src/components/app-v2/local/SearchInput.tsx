import type { InputHTMLAttributes } from "react";
import { SearchIcon, cn } from "@kiwiply/ui";

/** Rounded 12px grey search field with a leading icon. */
export default function SearchInput({
  className,
  inputClassName,
  size = "md",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: "sm" | "md"; inputClassName?: string }) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 rounded-xl border border-v2-line bg-[#F1F5FB] px-3 text-v2-muted focus-within:border-v2-blue",
        size === "sm" ? "h-9" : "h-11",
        className,
      )}
    >
      <SearchIcon className="h-4 w-4 flex-none" />
      <input
        type="search"
        className={cn(
          "min-w-0 flex-1 bg-transparent text-[13.5px] text-v2-navy outline-none placeholder:text-v2-muted",
          inputClassName,
        )}
        {...props}
      />
    </label>
  );
}
