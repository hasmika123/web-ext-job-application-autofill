import { CheckCircleIcon, cn } from "@kiwiply/ui";

/** A green tick-in-circle list (the boards' "All your saved jobs in one place" cards). */
export default function CheckList({ items, className, large }: { items: string[]; className?: string; large?: boolean }) {
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((t) => (
        <li key={t} className={cn("flex items-center gap-3 text-ink", large ? "text-[14.5px]" : "text-[13.5px]")}>
          <CheckCircleIcon className="h-5 w-5 flex-none text-v2-green" />
          {t}
        </li>
      ))}
    </ul>
  );
}
