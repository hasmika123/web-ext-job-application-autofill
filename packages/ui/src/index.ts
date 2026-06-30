/**
 * @kiwiply/ui — shared UI, consumed as source by web (Next, via transpilePackages) and the
 * extension (Vite/WXT). Design tokens live in `./styles/tokens.css` (imported separately).
 */
export { default as ResumeUpload } from "./ResumeUpload";
export type {
  EditTarget,
  SaveInput,
  SaveResult,
  ResumeToast,
  ResumeUploadServices,
} from "./ResumeUpload";
export type {
  StructuredResume,
  ParsedBio,
  ResumeExperience,
  ResumeEducation,
  ResumeLanguage,
  ResumeProject,
} from "./parser-core-types";
