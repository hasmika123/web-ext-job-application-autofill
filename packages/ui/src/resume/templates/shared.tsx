/**
 * Building blocks shared by templates. Same rules as a template: pure functions, only `.rz-*`
 * classes, no hooks, no inline styles. A template composes these and decides layout; the data
 * rules (what is hidden, which fields join, the date format) live here once.
 */
import { Fragment, type ReactNode } from "react";
import { flag, isObject, list, one, parseKind, str, visibleItems, visibleSections, type Json, type JsonObject } from "../doc";
import { DEFAULT_SECTION_TITLES, type DateStyle, type SectionKind } from "../types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EN_DASH = "–";
const EM_DASH = "—";
const MIDDOT = "·";

/** `YYYY-MM` -> "Jun 2022" (or "2022" in year style); `YYYY` -> "2022"; anything else as stored. */
export function formatDate(raw: string, style: DateStyle): string {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(raw);
  if (!m) return raw;
  const month = m[2] ? Number(m[2]) : 0;
  if (style === "year" || month < 1 || month > 12) return m[1];
  return `${MONTHS[month - 1]} ${m[1]}`;
}

/** "Jun 2022 - Present", "2019 - May 2022", a single date, or "". `current` wins over `end`. */
export function dateRange(item: Json, style: DateStyle): string {
  const start = formatDate(str(item, "start"), style);
  const end = formatDate(str(item, "end"), style);
  if (flag(item, "current")) return start ? `${start} ${EN_DASH} Present` : "Present";
  return start && end ? `${start} ${EN_DASH} ${end}` : start || end;
}

/** Only http(s) links become anchors; anything else is shown as plain text. */
export function safeHref(url: string): string | null {
  return /^https?:\/\/\S+$/i.test(url) ? url : null;
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

export function sectionTitle(section: Json, kind: SectionKind | null): string {
  return one(section, "title") || (kind ? DEFAULT_SECTION_TITLES[kind] : "Additional Information");
}

/** Present text pieces joined by `sep`, each wrapped so CSS can style them; empty pieces vanish. */
export function Parts({ parts, sep, className }: { parts: Array<string | ReactNode | null | false | undefined>; sep: string; className?: string }): ReactNode {
  const kept = parts.filter((p) => p !== "" && p !== null && p !== undefined && p !== false);
  if (kept.length === 0) return null;
  const out: ReactNode[] = [];
  kept.forEach((p, i) => {
    if (i > 0) {
      out.push(
        <span key={`s${i}`} className="rz-sep">
          {sep}
        </span>,
      );
    }
    out.push(<Fragment key={`p${i}`}>{p}</Fragment>);
  });
  return <span className={className}>{out}</span>;
}

export function Link({ url, label }: { url: string; label?: string }): ReactNode {
  const href = safeHref(url);
  const text = label || shortUrl(url);
  return href ? (
    <a className="rz-link" href={href}>
      {text}
    </a>
  ) : (
    <span>{text}</span>
  );
}

export function Bullets({ item }: { item: Json }): ReactNode {
  const texts: string[] = [];
  for (const b of list(item, "bullets")) {
    const t = isObject(b) ? one(b, "text") : "";
    if (t) texts.push(t);
  }
  if (texts.length === 0) return null;
  return (
    <ul className="rz-bullets">
      {texts.map((t, i) => (
        <li key={i} className="rz-bullet">
          {t}
        </li>
      ))}
    </ul>
  );
}

/** The header's contact entries, in text.ts order: email, phone, location, links. */
export function ContactLine({ basics }: { basics: Json }): ReactNode {
  const parts: ReactNode[] = [];
  const email = one(basics, "email");
  if (email) {
    parts.push(
      <a className="rz-link" href={`mailto:${email}`}>
        {email}
      </a>,
    );
  }
  for (const f of ["phone", "location"]) {
    const v = one(basics, f);
    if (v) parts.push(v);
  }
  for (const l of list(basics, "links")) {
    const url = one(l, "url");
    if (url) parts.push(<Link url={url} label={one(l, "label")} />);
  }
  if (parts.length === 0) return null;
  return <Parts className="rz-contact" parts={parts} sep=" | " />;
}

export function Header({ basics }: { basics: Json }): ReactNode {
  const name = one(basics, "name");
  const headline = one(basics, "headline");
  return (
    <header className="rz-header">
      {name ? <h1 className="rz-name">{name}</h1> : null}
      {headline ? <p className="rz-headline">{headline}</p> : null}
      <ContactLine basics={basics} />
    </header>
  );
}

/* ── Items ─────────────────────────────────────────────────────────────────────────────────── */

function ItemHead({ left, dates, sub }: { left: ReactNode; dates?: string; sub?: ReactNode }): ReactNode {
  return (
    <>
      <div className="rz-item-head">
        <div className="rz-item-main">{left}</div>
        {dates ? <div className="rz-item-dates">{dates}</div> : null}
      </div>
      {sub ? <div className="rz-item-sub">{sub}</div> : null}
    </>
  );
}

function renderItem(item: JsonObject, kind: SectionKind, dateStyle: DateStyle): ReactNode {
  switch (kind) {
    case "SUMMARY": {
      const t = str(item, "text");
      return t ? <p className="rz-text">{t}</p> : null;
    }
    case "EXPERIENCE":
    case "CUSTOM": {
      const title = one(item, "title");
      const org = one(item, "org");
      const location = one(item, "location");
      const dates = dateRange(item, dateStyle);
      const bullets = list(item, "bullets").some((b) => isObject(b) && one(b, "text"));
      if (!title && !org && !location && !dates && !bullets) return null;
      return (
        <div className="rz-item">
          <ItemHead
            left={
              <Parts
                parts={[title && <span className="rz-item-title">{title}</span>, org && <span className="rz-item-org">{org}</span>]}
                sep={` ${EM_DASH} `}
              />
            }
            dates={dates}
            sub={location}
          />
          <Bullets item={item} />
        </div>
      );
    }
    case "EDUCATION": {
      const degree = [one(item, "degree"), one(item, "field")].filter(Boolean).join(" in ");
      const school = one(item, "school");
      const gpa = one(item, "gpa");
      const location = one(item, "location");
      const dates = dateRange(item, dateStyle);
      const bullets = list(item, "bullets").some((b) => isObject(b) && one(b, "text"));
      if (!degree && !school && !location && !dates && !gpa && !bullets) return null;
      return (
        <div className="rz-item">
          <ItemHead
            left={
              <Parts
                parts={[degree && <span className="rz-item-title">{degree}</span>, school && <span className="rz-item-org">{school}</span>]}
                sep={` ${EM_DASH} `}
              />
            }
            dates={dates}
            sub={[location, gpa && `GPA: ${gpa}`].filter(Boolean).join(` ${MIDDOT} `)}
          />
          <Bullets item={item} />
        </div>
      );
    }
    case "SKILLS": {
      const skills = list(item, "skills").map((s) => (typeof s === "string" ? s.replace(/[\t-\r ]+/g, " ").trim() : "")).filter(Boolean);
      if (skills.length === 0) return null;
      const group = one(item, "group");
      return (
        <p className="rz-skill-row">
          {group ? <span className="rz-skill-group">{group}: </span> : null}
          <span className="rz-skill-list">{skills.join(", ")}</span>
        </p>
      );
    }
    case "PROJECTS": {
      const title = one(item, "title");
      const url = one(item, "url");
      const bullets = list(item, "bullets").some((b) => isObject(b) && one(b, "text"));
      if (!title && !url && !bullets) return null;
      return (
        <div className="rz-item">
          <ItemHead
            left={
              <Parts
                parts={[title && <span className="rz-item-title">{title}</span>, url && <Link url={url} />]}
                sep={` ${MIDDOT} `}
              />
            }
          />
          <Bullets item={item} />
        </div>
      );
    }
    case "CERTIFICATIONS": {
      const title = one(item, "title");
      const org = one(item, "org");
      const date = formatDate(str(item, "date"), dateStyle);
      const url = one(item, "url");
      if (!title && !org && !date && !url) return null;
      return (
        <div className="rz-item rz-item-tight">
          <ItemHead
            left={
              <Parts
                parts={[title && <span className="rz-item-title">{title}</span>, org && <span className="rz-item-org">{org}</span>]}
                sep={` ${EM_DASH} `}
              />
            }
            dates={date}
            sub={url ? <Link url={url} /> : null}
          />
        </div>
      );
    }
    case "LANGUAGES": {
      const name = one(item, "name");
      const level = one(item, "level");
      if (!name && !level) return null;
      return (
        <p className="rz-line">
          <Parts parts={[name && <span className="rz-item-title">{name}</span>, level]} sep={` ${EM_DASH} `} />
        </p>
      );
    }
    case "ACHIEVEMENTS": {
      const text = one(item, "text");
      const date = formatDate(str(item, "date"), dateStyle);
      if (!text && !date) return null;
      return (
        <ul className="rz-bullets">
          <li className="rz-bullet">
            <Parts parts={[text, date]} sep={` ${MIDDOT} `} />
          </li>
        </ul>
      );
    }
  }
}

/** A forward-compatible fallback for a section kind this version does not know: titled list of its text. */
function renderUnknownItem(item: JsonObject): ReactNode {
  const t = one(item, "title") || one(item, "name") || one(item, "text");
  return t ? (
    <ul className="rz-bullets">
      <li className="rz-bullet">{t}</li>
    </ul>
  ) : null;
}

export interface RenderedSection {
  id: string;
  kind: SectionKind | null;
  title: string;
  items: ReactNode[];
}

/**
 * Every visible section that has at least one renderable item, in document order, with its items
 * already rendered. Hidden sections/items, empty items and empty sections are dropped here so the
 * templates never have to repeat the rule.
 */
export function renderSections(doc: Json, dateStyle: DateStyle, only?: (kind: SectionKind | null) => boolean): RenderedSection[] {
  const out: RenderedSection[] = [];
  visibleSections(doc, null).forEach((s, si) => {
    const kind = parseKind(s.kind);
    if (only && !only(kind)) return;
    const items: ReactNode[] = [];
    for (const item of visibleItems(s)) {
      const node = kind ? renderItem(item, kind, dateStyle) : renderUnknownItem(item);
      if (node) items.push(node);
    }
    if (items.length === 0) return;
    out.push({ id: str(s, "id") || `s${si}`, kind, title: sectionTitle(s, kind), items });
  });
  return out;
}

export function Section({ section }: { section: RenderedSection }): ReactNode {
  return (
    <section className={`rz-section rz-section-${(section.kind ?? "custom").toLowerCase()}`}>
      <h2 className="rz-section-title">{section.title}</h2>
      <div className="rz-section-body">
        {section.items.map((node, i) => (
          <div key={i} className="rz-entry">
            {node}
          </div>
        ))}
      </div>
    </section>
  );
}

