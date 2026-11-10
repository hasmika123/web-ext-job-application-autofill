import { GoogleIcon, cn } from "@kiwiply/ui";
import { TONE, toneFor, type Tone } from "./tones";

/** Brand-ish tones for the companies that appear on the boards (the rest hash to a stable tone). */
const KNOWN: Record<string, Tone> = {
  amazon: "amber",
  microsoft: "blue",
  meta: "blue",
  netflix: "coral",
  stripe: "violet",
  apple: "slate",
  databricks: "coral",
  openai: "teal",
  tesla: "coral",
  salesforce: "blue",
  adobe: "coral",
  atlassian: "blue",
  spotify: "green",
  airbnb: "pink",
  notion: "slate",
};

/** Coloured initial square (Google renders the real G mark). Sizes are px. */
export default function CompanyTile({
  name,
  size = 40,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const isGoogle = name.trim().toLowerCase() === "google";
  const tone = KNOWN[name.trim().toLowerCase()] ?? toneFor(name);
  const t = TONE[tone];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid flex-none place-items-center rounded-[10px] font-extrabold",
        isGoogle ? "bg-paper" : cn(t.soft, t.ink),
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.44) }}
    >
      {isGoogle ? <GoogleIcon size={Math.round(size * 0.58)} /> : name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
