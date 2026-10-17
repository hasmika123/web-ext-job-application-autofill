/**
 * The static thumbnail of each registered resume template (`packages/ui/src/resume/thumbs/*.png`,
 * 240x340). Each template's `meta.thumb` is a file name there; this map turns it into an importable
 * URL for the bundler. Adding a template = one more line here (next to its registry entry).
 */
import modern from "@kiwiply/ui/resume/thumbs/modern.png";
import classic from "@kiwiply/ui/resume/thumbs/classic.png";
import compact from "@kiwiply/ui/resume/thumbs/compact.png";
import statement from "@kiwiply/ui/resume/thumbs/statement.png";
import sidebar from "@kiwiply/ui/resume/thumbs/sidebar.png";
import { getTemplate } from "@kiwiply/ui";

export interface ThumbSrc {
  src: string;
  width: number;
  height: number;
}

type Imported = string | { src: string; width?: number; height?: number };

const asSrc = (img: Imported): ThumbSrc =>
  // config-literal-ok: fallback pixel size of the bundled thumbnail PNGs (art dimensions, not resume.thumb.width)
  typeof img === "string" ? { src: img, width: 240, height: 340 } : { src: img.src, width: img.width ?? 240, height: img.height ?? 340 };

const THUMBS: Record<string, ThumbSrc> = {
  "modern.png": asSrc(modern as Imported),
  "sidebar.png": asSrc(sidebar as Imported),
  "compact.png": asSrc(compact as Imported),
  "classic.png": asSrc(classic as Imported),
  "statement.png": asSrc(statement as Imported),
};

/** The thumbnail for a template id; an unknown id gets the default template's (the registry's own fallback). */
export function thumbFor(templateId: string | null | undefined): ThumbSrc {
  return THUMBS[getTemplate(templateId).meta.thumb] ?? THUMBS["modern.png"];
}
