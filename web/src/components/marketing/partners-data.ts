// PLACEHOLDER — board copy, not verified; replace with real values before version2 is promoted
/**
 * Hero trust strip data (spec 13.2 item 1). The marks are styled TEXT wordmarks in brand colours -
 * no third-party logo files ship. `TrustStrip.tsx` renders whatever is here.
 */

export const PARTNERS_TRUST_LINE = "Trusted by 1M+ job seekers and 10,000+ companies";

export const PARTNERS_MORE = "and 1,000+ more...";

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

export const PARTNERS: Partner[] = [
  { name: "LinkedIn", text: "Linked", color: "#0A66C2", glyph: "in-tile", glyphColor: "#0A66C2" },
  { name: "Indeed", text: "indeed", color: "#2557A7" },
  { name: "Glassdoor", text: "glassdoor", color: "#0CAA41" },
  { name: "ZipRecruiter", text: "ZipRecruiter", color: "#14161F", glyph: "bolt", glyphColor: "#8BD130" },
  { name: "Handshake", text: "Handshake", color: "#111111", glyph: "bars", glyphColor: "#E03C31" },
  { name: "Wellfound", text: "wellfound", color: "#111111" },
  { name: "Workday", text: "workday", color: "#0875E1", glyph: "arc", glyphColor: "#F68D2E" },
  { name: "Greenhouse", text: "greenhouse", color: "#24A47F" },
];
