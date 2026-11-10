import { cn } from "@kiwiply/ui";

const BRAND_TILE: Record<string, string> = {
  LinkedIn: "bg-[#0A66C2] text-white",
  Indeed: "bg-[#2557A7] text-white",
  Greenhouse: "bg-[#24A47F] text-white",
  Workday: "bg-[#F5A623] text-white",
  Gmail: "bg-[#EA4335] text-white",
  Outlook: "bg-[#0F78D4] text-white",
  Slack: "bg-[#4A154B] text-white",
  "Google Calendar": "bg-[#4285F4] text-white",
  "Google Drive": "bg-[#0F9D58] text-white",
};

/** Lettered tile in a third-party brand colour (spec: third-party marks are initial tiles). */
export default function BrandTile({ name, size = 40 }: { name: string; size?: number }) {
  const label = name === "Google Calendar" ? "31" : name === "Google Drive" ? "D" : name[0];
  return (
    <span
      aria-hidden
      className={cn("inline-flex flex-none items-center justify-center rounded-xl font-extrabold", BRAND_TILE[name] ?? "bg-v2-navy text-white")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
    >
      {label}
    </span>
  );
}
