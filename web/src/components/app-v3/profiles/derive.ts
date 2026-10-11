import type { Resume } from "@/components/ResumeList";

/**
 * Builds the My Profiles overview from what the API has (account, the bio `payload`, resumes). The
 * default resume's `parsedJson` supplies title, summary, skills, experience, education and
 * projects. Nothing here touches the network, so it runs in the server page.
 */

export interface ProfileExperience {
  title: string;
  company: string;
  location: string;
  dates: string;
  current: boolean;
  bullets: string[];
}
export interface ProfileEducation {
  school: string;
  degree: string;
  dates: string;
  gpa: string;
}
export interface ProfileProject {
  name: string;
  bullets: string[];
}

export type TileStatus = "done" | "partial" | "todo";
export interface CompletenessTile {
  key: "personal" | "work" | "education" | "skills" | "projects" | "preferences";
  label: string;
  status: TileStatus;
  /** "Completed", "2/3", or "Add". */
  detail: string;
}

export interface ProfileView {
  name: string;
  email: string;
  /** Real values, or "" when the user has not provided them (the page substitutes the board's sample text). */
  title: string;
  location: string;
  about: string;
  skills: string[];
  experience: ProfileExperience[];
  education: ProfileEducation[];
  projects: ProfileProject[];
  tiles: CompletenessTile[];
  percent: number;
  versions: { id: number; label: string; date: string; isDefault: boolean }[];
  links: { linkedin: string; github: string; website: string };
  /** Real job-preference answers from the bio (empty strings when unset). */
  prefs: { workPreference: string; desiredSalary: string; relocate: string };
}

type Obj = Record<string, unknown>;
const asObj = (x: unknown): Obj => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : {});
const asArr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const asStr = (x: unknown): string => (typeof x === "string" ? x.trim() : "");
const strList = (x: unknown): string[] => asArr(x).filter((v): v is string => typeof v === "string" && v.trim() !== "");

const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "—";

const range = (a: string, b: string, current: boolean) => [a, current ? "Present" : b].filter(Boolean).join(" – ");

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
): ProfileView {
  const live = resumes.filter((r) => !r.archived);
  const def = live.find((r) => r.defaultResume) ?? [...live].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
  const parsed = parseResume(def);

  const experience: ProfileExperience[] = asArr(parsed.experience).map((e) => {
    const o = asObj(e);
    const current = !!o.current;
    return {
      title: asStr(o.title),
      company: asStr(o.company),
      location: asStr(o.location),
      dates: range(asStr(o.startDate), asStr(o.endDate), current),
      current,
      bullets: strList(o.bullets),
    };
  });
  const education: ProfileEducation[] = asArr(parsed.education).map((e) => {
    const o = asObj(e);
    return {
      school: asStr(o.school),
      degree: [asStr(o.degree), asStr(o.field)].filter(Boolean).join(", "),
      dates: range(asStr(o.startDate), asStr(o.endDate), false),
      gpa: asStr(o.gpa),
    };
  });
  const projects: ProfileProject[] = asArr(parsed.projects).map((p) => {
    const o = asObj(p);
    return { name: asStr(o.name), bullets: strList(o.bullets) };
  });

  const bioSkills = strList(bio.skills);
  const skills = Array.from(new Set([...bioSkills, ...strList(parsed.skills)]));

  const first = asStr(bio.firstName) || asStr(account?.firstName);
  const last = asStr(bio.lastName) || asStr(account?.lastName);
  const name = [first, last].filter(Boolean).join(" ") || asStr(account?.login) || "Your name";
  const email = asStr(bio.email) || asStr(account?.email);
  const location = [asStr(bio.city), asStr(bio.state) || asStr(bio.country)].filter(Boolean).join(", ");

  const filled = (k: string) => asStr(bio[k]) !== "";
  const personalKeys = ["firstName", "lastName", "email", "phone", "city"] as const;
  const personalVals: Record<(typeof personalKeys)[number], string> = {
    firstName: first,
    lastName: last,
    email,
    phone: asStr(bio.phone),
    city: asStr(bio.city),
  };
  const personalCount = personalKeys.filter((k) => personalVals[k] !== "").length;
  const prefsCount = ["workPreference", "desiredSalary", "noticePeriod", "willingToRelocate"].filter(filled).length;

  const tile = (key: CompletenessTile["key"], label: string, status: TileStatus, detail: string): CompletenessTile => ({
    key,
    label,
    status,
    detail,
  });
  const projectsDone = Math.min(projects.length, 3);
  const tiles: CompletenessTile[] = [
    personalCount >= personalKeys.length
      ? tile("personal", "Personal Info", "done", "Completed")
      : tile("personal", "Personal Info", personalCount > 0 ? "partial" : "todo", `${personalCount}/${personalKeys.length}`),
    experience.length > 0 ? tile("work", "Work Experience", "done", "Completed") : tile("work", "Work Experience", "todo", "Add"),
    education.length > 0 ? tile("education", "Education", "done", "Completed") : tile("education", "Education", "todo", "Add"),
    skills.length > 0 ? tile("skills", "Skills", "done", "Completed") : tile("skills", "Skills", "todo", "Add"),
    projectsDone >= 3
      ? tile("projects", "Projects", "done", "Completed")
      : tile("projects", "Projects", projectsDone > 0 ? "partial" : "todo", `${projectsDone}/3`),
    prefsCount >= 2
      ? tile("preferences", "Job Preferences", "done", "Completed")
      : tile("preferences", "Job Preferences", prefsCount > 0 ? "partial" : "todo", prefsCount > 0 ? "In progress" : "Add"),
  ];
  const score =
    (personalCount / personalKeys.length) +
    (experience.length > 0 ? 1 : 0) +
    (education.length > 0 ? 1 : 0) +
    (skills.length > 0 ? 1 : 0) +
    projectsDone / 3 +
    Math.min(prefsCount / 2, 1);

  return {
    name,
    email,
    title: experience.find((e) => e.title)?.title ?? "",
    location,
    about: asStr(parsed.summary),
    skills,
    experience,
    education,
    projects,
    tiles,
    percent: Math.round((score / 6) * 100),
    versions: live
      .slice()
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .map((r) => ({ id: r.id, label: r.label, date: fmtDate(r.createdAt), isDefault: def ? r.id === def.id : false })),
    links: { linkedin: asStr(bio.linkedin), github: asStr(bio.github), website: asStr(bio.website) },
    prefs: { workPreference: asStr(bio.workPreference), desiredSalary: asStr(bio.desiredSalary), relocate: asStr(bio.willingToRelocate) },
  };
}
