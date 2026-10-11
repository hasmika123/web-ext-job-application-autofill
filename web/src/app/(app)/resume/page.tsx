import { redirectLegacy } from "@/lib/legacy-redirect";

/** Resume became Resume Builder (app v3). The old page body is in git history (baa503f) for the rebuild. */
export default function ResumeRedirect() {
  redirectLegacy("/resume-builder");
}
