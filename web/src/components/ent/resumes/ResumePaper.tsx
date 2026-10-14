"use client";

import { MailIcon, MapPinIcon } from "@kiwiply/ui";
import { yearsText, type ResumeDetail } from "@/lib/ent/resumes";

/**
 * The generated preview: a paper mock drawn from the structured fields of the resume (headline, summary, the consultant's skills, the experience
 * rows). It is NOT a rendering of a file (none is stored) and it says so to assistive tech. Skills and experience that do not exist are simply not
 * drawn; there are no placeholder lines or invented content.
 */
function Bars({ n, last = 62 }: { n: number; last?: number }) {
  return (
    <span aria-hidden className="mt-[3px] block space-y-[3px]">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="block h-[3px] rounded-full bg-[#e4e9f2]" style={{ width: i === n - 1 ? `${last}%` : "100%" }} />
      ))}
    </span>
  );
}

/** The drawer's thumbnail: the record's own headline, skills and experience, with grey lines where the paragraphs of text would be. */
function Thumbnail({ detail }: { detail: ResumeDetail }) {
  const { row, preview } = detail;
  const c = row.consultant;
  const lines = Math.min(3, Math.max(2, Math.ceil((preview.summary ?? "").length / 70)));
  return (
    <article aria-label={`Generated preview of ${row.name}`} data-resume-paper data-thumb className="rounded-[7px] border border-[#e6ecf5] bg-white p-3 text-[#1a2556] shadow-[0_2px_8px_rgba(30,64,120,0.1)]">
      <h3 className="text-[15px] font-bold leading-tight">{c.name}</h3>
      {preview.headline && <p className="text-[9px] font-semibold leading-snug">{preview.headline}</p>}
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[6.5px] text-[#6a7699]">
        {c.email && (
          <span className="inline-flex items-center gap-0.5">
            <MailIcon aria-hidden size={7} /> {c.email}
          </span>
        )}
        {c.location && (
          <span className="inline-flex items-center gap-0.5">
            <MapPinIcon aria-hidden size={7} /> {c.location}
          </span>
        )}
      </p>
      {preview.summary && (
        <section className="mt-2.5">
          <h4 className="text-[6.5px] font-bold uppercase tracking-wide text-[#1a2556]">Professional summary</h4>
          <p className="sr-only">{preview.summary}</p>
          <Bars n={lines} />
        </section>
      )}
      {preview.skills.length > 0 && (
        <section className="mt-2.5">
          <h4 className="text-[6.5px] font-bold uppercase tracking-wide">Key skills</h4>
          <ul className="mt-1 flex flex-wrap gap-[3px]">
            {preview.skills.map((s) => (
              <li key={s} className="rounded-[3px] border border-[#e1e8f3] bg-[#f6f8fc] px-1 py-px text-[6px] text-[#46527e]">
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}
      {preview.experience.length > 0 && (
        <section className="mt-2.5">
          <h4 className="text-[6.5px] font-bold uppercase tracking-wide">Experience</h4>
          <ul className="mt-1 space-y-2">
            {preview.experience.map((e, i) => (
              <li key={`${e.title}-${i}`}>
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[7px] font-bold">{e.title}</span>
                    <span className="block truncate text-[6px] text-[#6a7699]">{e.employer}</span>
                  </span>
                  <span className="flex-none text-[6px] text-[#6a7699]">{yearsText(e)}</span>
                </span>
                <Bars n={2} last={48} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {!preview.summary && preview.skills.length === 0 && preview.experience.length === 0 && (
        <p className="mt-3 text-[8px] text-[#6a7699]">This record has no summary, skills or experience yet, so there is nothing more to preview.</p>
      )}
    </article>
  );
}

export default function ResumePaper({ detail, large = false }: { detail: ResumeDetail; large?: boolean }) {
  if (!large) return <Thumbnail detail={detail} />;
  const { row, preview } = detail;
  const c = row.consultant;
  const text = large ? "text-[13px]" : "text-[10px]";
  const head = large ? "text-[22px]" : "text-[15px]";
  const label = large ? "text-[11px]" : "text-[8px]";
  const empty = !preview.summary && preview.skills.length === 0 && preview.experience.length === 0;
  return (
    <article
      aria-label={`Generated preview of ${row.name}`}
      data-resume-paper
      className={`rounded-md border border-line bg-paper text-ink shadow-sm ${large ? "p-8" : "p-4"} ${text} leading-snug`}
    >
      <h3 className={`${head} font-bold leading-tight`}>{c.name}</h3>
      {preview.headline && <p className="font-semibold">{preview.headline}</p>}
      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-ink-soft">
        {c.email && (
          <span className="inline-flex items-center gap-1">
            <MailIcon aria-hidden size={large ? 13 : 9} /> {c.email}
          </span>
        )}
        {c.location && (
          <span className="inline-flex items-center gap-1">
            <MapPinIcon aria-hidden size={large ? 13 : 9} /> {c.location}
          </span>
        )}
      </p>
      {preview.summary && (
        <section className="mt-3">
          <h4 className={`${label} font-bold uppercase tracking-wider text-ink-soft`}>Professional summary</h4>
          <p className="mt-1">{preview.summary}</p>
        </section>
      )}
      {preview.skills.length > 0 && (
        <section className="mt-3">
          <h4 className={`${label} font-bold uppercase tracking-wider text-ink-soft`}>Key skills</h4>
          <ul className="mt-1 flex flex-wrap gap-1">
            {preview.skills.map((s) => (
              <li key={s} className="rounded-full border border-line bg-paper-2 px-1.5 py-px">
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}
      {preview.experience.length > 0 && (
        <section className="mt-3">
          <h4 className={`${label} font-bold uppercase tracking-wider text-ink-soft`}>Experience</h4>
          <ul className="mt-1 space-y-1.5">
            {preview.experience.map((e, i) => (
              <li key={`${e.title}-${i}`} className="flex items-start justify-between gap-3">
                <span>
                  <span className="block font-semibold">{e.title}</span>
                  <span className="block text-ink-soft">{e.employer}</span>
                </span>
                <span className="flex-none text-ink-soft">{yearsText(e)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {empty && <p className="mt-3 text-ink-soft">This record has no summary, skills or experience yet, so there is nothing more to preview.</p>}
    </article>
  );
}
