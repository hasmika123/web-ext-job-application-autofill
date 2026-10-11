import type { InputHTMLAttributes } from "react";
import { SearchIcon, cn } from "@kiwiply/ui";

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md" | "lg";
  wrapperClassName?: string;
}

const SIZES = { sm: "h-9 text-[13px]", md: "h-11 text-[14px]", lg: "h-12 text-[15px]" } as const;

/** Rounded 12px grey search field with a leading search icon. Pass `value`/`onChange` to control it. */
export default function SearchInput({ size = "md", className, wrapperClassName, placeholder, ...props }: SearchInputProps) {
  return (
    <label className={cn("relative block", wrapperClassName)}>
      <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-v2-muted" />
      <input
        type="search"
        placeholder={placeholder}
        aria-label={props["aria-label"] ?? placeholder ?? "Search"}
        className={cn(
          "w-full rounded-xl border border-transparent bg-v2-blue-soft/60 pl-10 pr-3.5 text-ink outline-none transition-colors",
          "placeholder:text-v2-muted focus:border-v2-blue/40 focus:bg-paper focus-visible:ring-2 focus-visible:ring-v2-blue/25",
          "[&::-webkit-search-cancel-button]:hidden",
          SIZES[size],
          className,
        )}
        {...props}
      />
    </label>
  );
}
