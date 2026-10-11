import { redirectLegacy } from "@/lib/legacy-redirect";

/** Company Research, Networking and Learning are folded into Explore (app v3). */
export default function ExploreRedirect() {
  redirectLegacy("/explore");
}
