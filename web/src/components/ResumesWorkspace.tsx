"use client";

import { useState } from "react";
import { ResumeUpload, type EditTarget } from "@kiwiply/ui";
import ResumeList, { type Resume } from "@/components/ResumeList";
import type { StructuredResume } from "@/lib/parser-core";
import { useResumeUploadServices } from "@/lib/use-resume-upload-services";

type BaseProfile = Record<string, unknown>;

const asArr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const asStr = (x: unknown): string => (typeof x === "string" ? x : "");
const asObj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
const strList = (x: unknown): string[] => asArr(x).filter((v): v is string => typeof v === "string");

/** Parse a stored `parsedJson` into a well-formed StructuredResume (missing/garbled
 *  fields default rather than throw), so the review editor always opens cleanly. */
function coerceStruct(raw?: string | null): StructuredResume {
  let parsed: unknown = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  const p = asObj(parsed);
  return {
    summary: asStr(p.summary),
    skills: strList(p.skills),
    experience: asArr(p.experience).map((r) => {
      const e = asObj(r);
      return {
        company: asStr(e.company),
        title: asStr(e.title),
        location: asStr(e.location),
        startDate: asStr(e.startDate),
        endDate: asStr(e.endDate),
        current: !!e.current,
        bullets: strList(e.bullets),
      };
    }),
    education: asArr(p.education).map((r) => {
      const e = asObj(r);
      return {
        school: asStr(e.school),
        degree: asStr(e.degree),
        field: asStr(e.field),
        startDate: asStr(e.startDate),
        endDate: asStr(e.endDate),
        gpa: asStr(e.gpa),
        location: asStr(e.location),
      };
    }),
    languages: asArr(p.languages).map((r) => {
      const e = asObj(r);
      return { name: asStr(e.name), proficiency: asStr(e.proficiency) };
    }),
    projects: asArr(p.projects).map((r) => {
      const e = asObj(r);
      return { name: asStr(e.name), bullets: strList(e.bullets) };
    }),
  };
}

/**
 * Hosts the upload/review editor and the saved-resumes list together so "Edit" on a list
 * row can reopen the same review editor seeded with that resume's stored structure. Each
 * edit bumps a sequence used as ResumeUpload's `key`, remounting it so the new target seeds
 * fresh initial state (no setState-in-effect) — and re-editing the same resume re-opens it.
 */
export default function ResumesWorkspace({
  baseProfile,
  resumes,
  usage,
}: {
  baseProfile: BaseProfile;
  resumes: Resume[];
  usage: Record<number, number>;
}) {
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editSeq, setEditSeq] = useState(0);
  const services = useResumeUploadServices();

  const onEdit = (r: Resume) => {
    setEditTarget({ id: r.id, label: r.label, structured: coerceStruct(r.parsedJson) });
    setEditSeq((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-10">
      <ResumeUpload
        key={editSeq}
        baseProfile={baseProfile}
        editTarget={editTarget}
        sectionsDefaultOpen
        existingLabels={resumes.map((r) => r.label)}
        {...services}
      />
      <ResumeList resumes={resumes} usage={usage} onEdit={onEdit} />
    </div>
  );
}
