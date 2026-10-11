/**
 * Hero trust strip + roadmap data (spec 13.2 item 1). The marks are styled TEXT wordmarks in brand
 * colours - no third-party logo files ship. `TrustStrip.tsx` and `sections/Roadmap.tsx` render
 * whatever is here.
 *
 * REAL DATA, NOT PLACEHOLDER: these lists state what the extension actually supports. Edit them
 * whenever support changes (a site moves from "soon" to "today", a new ATS lands) so the public
 * pages never claim more than the product does. Source of truth for ATS support: CLAUDE.md.
 */

export const PARTNERS_TRUST_LINE = "Works where you apply today — with more on the way.";

export type PartnerGlyph = "in-tile" | "bolt" | "bars" | "arc";

export interface Partner {
  name: string;
  /** Wordmark text as written on the board. */
  text: string;
  /** Hex colour of the wordmark text. */
  color: string;
  /** Decoration drawn with the wordmark. */
  glyph?: PartnerGlyph;
  /** Hex colour of the glyph (defaults to the text colour). */
  glyphColor?: string;
}

/** Supported today: LinkedIn plus the ATS set the engine has captured real DOM for. */
export const WORKS_TODAY: Partner[] = [
  { name: "LinkedIn", text: "Linked", color: "#0A66C2", glyph: "in-tile", glyphColor: "#0A66C2" },
  { name: "Workday", text: "workday", color: "#0875E1", glyph: "arc", glyphColor: "#F68D2E" },
  { name: "Greenhouse", text: "greenhouse", color: "#24A47F" },
  { name: "Lever", text: "lever", color: "#1F2A5A" },
  { name: "Ashby", text: "Ashby", color: "#1A1A1A" },
  { name: "Workable", text: "workable", color: "#1E6FF5" },
];

/** On the roadmap, shown muted with a "Soon" chip. */
export const ON_THE_ROADMAP: Partner[] = [
  { name: "Indeed", text: "indeed", color: "#2557A7" },
  { name: "Glassdoor", text: "glassdoor", color: "#0CAA41" },
  { name: "ZipRecruiter", text: "ZipRecruiter", color: "#14161F", glyph: "bolt", glyphColor: "#8BD130" },
  { name: "Handshake", text: "Handshake", color: "#111111", glyph: "bars", glyphColor: "#E03C31" },
  { name: "Wellfound", text: "wellfound", color: "#111111" },
];

/** Where the "See what's next" link lands (the `Roadmap` section on the landing page). */
export const ROADMAP_HREF = "/#roadmap";

export type RoadmapStatus = "now" | "progress" | "planned";

export interface RoadmapColumn {
  status: RoadmapStatus;
  title: string;
  items: string[];
}

/** The three-column "Where Kiwiply works next" list. */
export const ROADMAP: RoadmapColumn[] = [
  {
    status: "now",
    title: "Available now",
    items: ["LinkedIn Easy Apply forms", "Workday", "Greenhouse", "Lever", "Ashby", "Workable", "Gmail inbox tracking"],
  },
  { status: "progress", title: "In progress", items: ["Indeed", "Glassdoor", "ZipRecruiter"] },
  { status: "planned", title: "Planned", items: ["Handshake", "Wellfound", "Outlook inbox"] },
];
