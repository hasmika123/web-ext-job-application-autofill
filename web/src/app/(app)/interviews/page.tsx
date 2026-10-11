import { redirectLegacy } from "@/lib/legacy-redirect";

/** Interviews became Interview Prep (app v3). */
export default function InterviewsRedirect() {
  redirectLegacy("/interview-prep");
}
