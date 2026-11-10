import { redirectLegacy } from "@/lib/legacy-redirect";

/** Career Insights became Analytics (app v3). */
export default function InsightsRedirect() {
  redirectLegacy("/analytics");
}
