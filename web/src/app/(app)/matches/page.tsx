import { redirect } from "next/navigation";

/** Daily job matches now live in Job Search (app v2). The old route keeps resolving for emails. */
export default function MatchesRedirect() {
  redirect("/jobs");
}
