import { redirectLegacy } from "@/lib/legacy-redirect";

/** Profile became My Profiles (app v3). The bio editor component (BioEditor) is reused there. */
export default function ProfileRedirect() {
  redirectLegacy("/profiles");
}
