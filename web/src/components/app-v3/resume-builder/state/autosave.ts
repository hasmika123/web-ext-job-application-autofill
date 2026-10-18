/**
 * The Resume Builder's autosave controller (DESIGN 3.2 / 7.2) now lives in `@/lib/autosave` as a generic
 * controller (E2E-U0.0) so every page can use it; this file is the document-typed shim the editor keeps importing.
 * Behaviour is unchanged: see `@/lib/autosave` for the debounce / If-Match / 409 / backoff contract and
 * `./autosave.test.ts` for its tests.
 */
import type { ResumeDocument } from "@kiwiply/ui";
import {
  AUTOSAVE_DELAY_MS,
  RETRY_DELAYS_MS,
  createAutosave as createGenericAutosave,
  type Autosave as GenericAutosave,
  type AutosaveEvents as GenericAutosaveEvents,
  type AutosaveOptions as GenericAutosaveOptions,
  type Snapshot as GenericSnapshot,
} from "@/lib/autosave";

export { AUTOSAVE_DELAY_MS, RETRY_DELAYS_MS };

export type Snapshot = GenericSnapshot<ResumeDocument>;
export type AutosaveEvents = GenericAutosaveEvents<ResumeDocument>;
export type AutosaveOptions = GenericAutosaveOptions<ResumeDocument>;
export type Autosave = GenericAutosave<ResumeDocument>;

export function createAutosave(opts: AutosaveOptions): Autosave {
  return createGenericAutosave<ResumeDocument>(opts);
}
