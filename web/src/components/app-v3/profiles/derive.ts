import type { Resume } from "@/components/ResumeList";
import type { Completeness, ProfileItem } from "@/lib/profile-items";
import { skillList } from "./itemSchema";

/**
 * Formatting for My Profiles > Overview (R1.2). The career data itself now lives in profile items and
 * the meter is the API's (`GET /api/profile/completeness`), so this file only turns what the page
 * fetched (account, bio, items, resumes, completeness) into display strings and tile states. Nothing
 * here touches the network, so it runs in the server page.
 */

export type TileStatus = "done" | "partial" | "todo";
export interface CompletenessTile {
  key: "personal" | "work" | "education" | "skills" | "projects" | "preferences";
  label: string;
  status: TileStatus;
  /** "Completed", "2/5", "3 added" or "Add". */
  detail: string;
}

export interface BuiltResume {
  id: number;
  label: string;
}

export interface ProfileView {
  name: string;
  email: string;
  /** Real values, or "" when the user has not provided them (the page substitutes the board's sample text). */
  title: string;
  location: string;
  about: string;
  skills: string[];
  versions: { id: number; label: string; date: string; isDefault: boolean }[];
  /** The user's built (Resume Builder) resumes: the Overview's Targets row. */
  built: BuiltResume[];
  links: { linkedin: string; github: string; website: string };
  /** Real job-preference answers from the bio (empty strings when unset). */
  prefs: { workPreference: string; desiredSalary: string; relocate: string };
}

type Obj = Record<string, unknown>;
const asObj = (x: unknown): Obj => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : {});
const asStr = (x: unknown): string => (typeof x === "string" ? x.trim() : "");

const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "—";

function parseResume(r: Resume | undefined): Obj {
  if (!r?.parsedJson) return {};
  try {
    return asObj(JSON.parse(r.parsedJson));
  } catch {
    return {};
  }
}

export function deriveProfile(
  account: { login?: string; email?: string; firstName?: string; lastName?: string } | null,
  bio: Record<string, unknown>,
  resumes: Resume[],
  items: ProfileItem[],
): ProfileView {
  const live = resumes.filter((r) => !r.archived);
  const def = live.find((r) => r.defaultResume) ?? [...live].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
  const parsed = parseResume(def);

  const experience = items
    .filter((i) => i.section === "EXPERIENCE")
    .sort((a, b) => a.position - b.position);
  const bioSkills = Array.isArray(bio.skills) ? bio.skills.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
  const itemSkills = items.filter((i) => i.section === "SKILL").flatMap((i) => skillList(i.data));
  const skills = Array.from(new Set([...itemSkills, ...bioSkills]));

  const first = asStr(bio.firstName) || asStr(account?.firstName);
  const last = asStr(bio.lastName) || asStr(account?.lastName);
  const name = [first, last].filter(Boolean).join(" ") || asStr(account?.login) || "Your name";
  const email = asStr(bio.email) || asStr(account?.email);
  const location = [asStr(bio.city), asStr(bio.state) || asStr(bio.country)].filter(Boolean).join(", ");

  return {
    name,
    email,
    title: asStr(bio.headline) || (experience.length > 0 ? asStr(experience[0].data.title) : ""),
    location,
    about: asStr(bio.summary) || asStr(parsed.summary),
    skills,
    versions: live
      .slice()
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .map((r) => ({ id: r.id, label: r.label, date: fmtDate(r.createdAt), isDefault: def ? r.id === def.id : false })),
    built: live.filter((r) => r.kind === "BUILT").map((r) => ({ id: r.id, label: r.label })),
    links: { linkedin: asStr(bio.linkedin), github: asStr(bio.github), website: asStr(bio.website) },
    prefs: { workPreference: asStr(bio.workPreference), desiredSalary: asStr(bio.desiredSalary), relocate: asStr(bio.willingToRelocate) },
  };
}

/** The completeness parts that make up the "Personal Info" tile. */
export const PERSONAL_PARTS = ["identity", "location", "headline", "summary", "links"] as const;

/**
 * The Overview tiles from the server's completeness parts (DESIGN v1 2.4: the tiles map to the meter's
 * parts). Personal Info is five parts, so it can be partial; Projects has no part in the meter, so it
 * is simply "n added" from the items. `completeness` null (API unreachable) leaves every tile on "Add".
 */
export function buildTiles(completeness: Completeness | null, items: ProfileItem[]): CompletenessTile[] {
  const parts = completeness?.parts ?? {};
  const done = (k: string) => parts[k]?.done === true;
  const count = (section: ProfileItem["section"]) => items.filter((i) => i.section === section).length;

  const personalDone = PERSONAL_PARTS.filter(done).length;
  const skillsCount = new Set(items.filter((i) => i.section === "SKILL").flatMap((i) => skillList(i.data).map((s) => s.toLowerCase()))).size;
  const projects = count("PROJECT");

  const tile = (key: CompletenessTile["key"], label: string, status: TileStatus, detail: string): CompletenessTile => ({ key, label, status, detail });
  return [
    personalDone === PERSONAL_PARTS.length
      ? tile("personal", "Personal Info", "done", "Completed")
      : tile("personal", "Personal Info", personalDone > 0 ? "partial" : "todo", personalDone > 0 ? `${personalDone}/${PERSONAL_PARTS.length}` : "Add"),
    done("experience")
      ? tile("work", "Work Experience", "done", "Completed")
      : tile("work", "Work Experience", count("EXPERIENCE") > 0 ? "partial" : "todo", count("EXPERIENCE") > 0 ? "Add bullets" : "Add"),
    done("education") ? tile("education", "Education", "done", "Completed") : tile("education", "Education", "todo", "Add"),
    done("skills")
      ? tile("skills", "Skills", "done", "Completed")
      : tile("skills", "Skills", skillsCount > 0 ? "partial" : "todo", skillsCount > 0 ? `${skillsCount} skills` : "Add"),
    projects > 0 ? tile("projects", "Projects", "done", `${projects} added`) : tile("projects", "Projects", "todo", "Add"),
    done("preferences") ? tile("preferences", "Job Preferences", "done", "Completed") : tile("preferences", "Job Preferences", "todo", "Add"),
  ];
}
