import { redirectLegacy } from "@/lib/legacy-redirect";

/** Daily job matches live in Job Search (app v2 and v3). The old route keeps resolving for emails. */
export default function MatchesRedirect() {
  redirectLegacy("/jobs");
}
