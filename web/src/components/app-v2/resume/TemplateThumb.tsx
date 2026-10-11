import { CheckIcon, cn } from "@kiwiply/ui";

const LINE = "h-[3px] rounded-full bg-[#D5DAE6]";

/** A tiny CSS-drawn resume page for the template picker (decorative; the label is the name). */
export default function TemplateThumb({ name, selected, onSelect }: { name: string; selected: boolean; onSelect: () => void }) {
  const variant = name.toLowerCase();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="group flex w-[88px] flex-none flex-col items-center gap-1.5 text-center sm:w-auto sm:flex-1"
    >
      <span
        className={cn(
          "relative block aspect-[3/4] w-full overflow-hidden rounded-lg border-2 bg-white p-1.5 text-left",
          selected ? "border-v2-green shadow-[0_0_0_3px_rgba(32,179,61,.15)]" : "border-v2-line group-hover:border-[#C9CFDC]",
        )}
      >
        {variant === "professional" && <span aria-hidden className="absolute inset-x-0 top-0 block h-[26%] bg-v2-navy" />}
        {variant === "creative" && (
          <span aria-hidden className="absolute inset-0 block bg-[linear-gradient(135deg,#7ED8C4_0%,#B9A6F5_45%,#FFB7D6_100%)] opacity-70" />
        )}
        {variant === "tech" && <span aria-hidden className="absolute inset-y-0 left-0 block w-[28%] bg-[#E8F0FF]" />}
        <span aria-hidden className={cn("relative block", variant === "tech" && "pl-[30%]")}>
          <span className={cn("mb-1 block h-[5px] w-1/2 rounded-full", variant === "professional" ? "bg-white" : "bg-v2-navy")} />
          <span className={cn("mb-2 block", LINE, "w-1/3", variant === "professional" && "bg-white/60")} />
          {[80, 95, 70, 90, 60, 85, 75, 92].map((w, i) => (
            <span key={i} className={cn("mb-1 block", LINE)} style={{ width: `${w}%` }} />
          ))}
        </span>
        {selected && (
          <span aria-hidden className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-v2-green text-white">
            <CheckIcon className="h-2.5 w-2.5" />
          </span>
        )}
      </span>
      <span className={cn("text-[12.5px]", selected ? "font-bold text-v2-navy" : "text-v2-ink-soft")}>{name}</span>
    </button>
  );
}
