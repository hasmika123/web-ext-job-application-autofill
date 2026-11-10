import type { ComponentType } from "react";
import {
  BriefcaseIcon,
  FileTextIcon,
  GlobeIcon,
  GraduationCapIcon,
  HeartIcon,
  LayersIcon,
  LayoutGridIcon,
  NetworkIcon,
  ShieldCheckIcon,
  TrophyIcon,
} from "@kiwiply/ui";
import type { IconProps, ResumeSectionKind } from "@kiwiply/ui";
import type { ItemTextField } from "./state/types";

/** What the canvas (and later the Add Section / Swap Section panels) knows about each section kind. */
export interface KindMeta {
  icon: ComponentType<IconProps>;
  /** The "+ Add <singular>" button label; `null` = the section holds one text and has no add button (Summary). */
  addLabel: string | null;
  /** The noun in toasts and aria labels ("Experience removed"). */
  singular: string;
  /** The empty-section placeholder row ("Add your first experience..."). */
  placeholder: string;
  /** The item field that takes focus when an item is added (also the placeholder's field). */
  firstField: ItemTextField;
  /** Items are drawn on the dated timeline (dot + left date column). */
  timeline: boolean;
}

export const KIND_META: Record<ResumeSectionKind, KindMeta> = {
  SUMMARY: { icon: FileTextIcon, addLabel: null, singular: "Summary", placeholder: "Start with a summary...", firstField: "text", timeline: false },
  EXPERIENCE: { icon: BriefcaseIcon, addLabel: "Add Experience", singular: "Experience", placeholder: "Add your first experience...", firstField: "title", timeline: true },
  EDUCATION: { icon: GraduationCapIcon, addLabel: "Add Education", singular: "Education", placeholder: "Add your education...", firstField: "degree", timeline: true },
  SKILLS: { icon: NetworkIcon, addLabel: "Add Group", singular: "Skill group", placeholder: "Add your first skill group...", firstField: "group", timeline: false },
  PROJECTS: { icon: LayersIcon, addLabel: "Add Project", singular: "Project", placeholder: "Add your first project...", firstField: "title", timeline: true },
  CERTIFICATIONS: { icon: ShieldCheckIcon, addLabel: "Add Certification", singular: "Certification", placeholder: "Add a certification...", firstField: "title", timeline: false },
  LANGUAGES: { icon: GlobeIcon, addLabel: "Add Language", singular: "Language", placeholder: "Add a language...", firstField: "name", timeline: false },
  ACHIEVEMENTS: { icon: TrophyIcon, addLabel: "Add Achievement", singular: "Achievement", placeholder: "Add an achievement...", firstField: "text", timeline: false },
  INTERESTS: { icon: HeartIcon, addLabel: "Add Interest", singular: "Interest", placeholder: "Add an interest...", firstField: "text", timeline: false },
  CUSTOM: { icon: LayoutGridIcon, addLabel: "Add Entry", singular: "Entry", placeholder: "Add your first entry...", firstField: "title", timeline: true },
};
