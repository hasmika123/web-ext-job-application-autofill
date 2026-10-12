/** "Adding 3 roles, 1 school, 2 projects and 14 skills." (the recap of the review, ONBOARDING-V2-DESIGN 5.6). */
export function summaryLine(counts: { EXPERIENCE: number; EDUCATION: number; PROJECT: number }, skills: number): string {
  const part = (n: number, one: string, many: string) => (n > 0 ? `${n} ${n === 1 ? one : many}` : "");
  const parts = [
    part(counts.EXPERIENCE, "role", "roles"),
    part(counts.EDUCATION, "school", "schools"),
    part(counts.PROJECT, "project", "projects"),
    part(skills, "skill", "skills"),
  ].filter(Boolean);
  if (parts.length === 0) return "Nothing to add to your profile yet. You can add things from your profile any time.";
  const last = parts.pop() as string;
  return `Adding ${parts.length > 0 ? `${parts.join(", ")} and ${last}` : last}.`;
}
