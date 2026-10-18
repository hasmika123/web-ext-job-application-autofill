/**
 * The marketer's source link and quick info for a job (table `cws_job_source`). Kiwiply does not hold full job details: the marketer enters a
 * few details, the posting link and a short note; the consultant opens the link and applies on the source site with the Kiwiply extension, and
 * the application then shows up in My Applications (extension tracking). Shared by Job Discovery, Job Matches and Assigned Opportunities.
 */

export interface JobSource {
  /** https link to the posting, or null when the marketer has not added one (or it failed the sanity check). */
  sourceUrl: string | null;
  sourceName: string | null;
  /** The marketer's short note (not a full posting). */
  quickInfo: string | null;
  /** True for demo stand-in rows: show the Sample mark where the link is displayed. */
  sourceSample: boolean;
}

export const NO_LINK_TOOLTIP = "Your marketer hasn't added the link yet";
export const APPLY_HELPER = "Apply on the source site with the Kiwiply extension — your application shows up in My Applications automatically.";
export const QUICK_INFO_LABEL = "Marketer's quick info";

/**
 * The URL when it is a plain https link with a real host and no credentials; else null. The API checks too: this is the second line of defence.
 * One exception: a plain-http link on a named `*.localhost` host (the local stand-in employer pages of a development or demo stack). Such a link
 * can only ever point at the viewer's own machine, and the API hands one out only when its own demo switch is on.
 */
export function safeHttpsUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "" || t.length > 500 || /\s/.test(t)) return null;
  try {
    const u = new URL(t);
    if (u.username !== "" || u.password !== "") return null;
    const localStandIn = u.protocol === "http:" && /\.localhost$/i.test(u.hostname);
    if (u.protocol !== "https:" && !localStandIn) return null;
    if (!u.hostname.includes(".") || u.hostname.startsWith(".") || u.hostname.endsWith(".")) return null;
    return t;
  } catch {
    return null;
  }
}

const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** The four source fields of a job/match/opportunity object off the wire (tolerant: anything odd becomes "no link"). */
export function parseJobSource(o: Record<string, unknown>): JobSource {
  return { sourceUrl: safeHttpsUrl(o.sourceUrl), sourceName: strOrNull(o.sourceName), quickInfo: strOrNull(o.quickInfo), sourceSample: o.sourceSample === true };
}

/** "Open job link" label for assistive tech: names the job and, when known, the site. */
export function openLinkLabel(title: string, s: Pick<JobSource, "sourceName">): string {
  return `Open job link for ${title}${s.sourceName ? ` on ${s.sourceName}` : ""} (opens in a new tab)`;
}
