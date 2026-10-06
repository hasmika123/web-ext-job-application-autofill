package com.dossier.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The deterministic half of the ATS resume score (Phase 13.5): fifteen checks on a resume's parsed
 * structure — what an applicant-tracking system and a recruiter's six-second skim both punish. No
 * AI, no network, free to run: it reads the same parsed JSON autofill uses.
 *
 * <p>Each check has a weight (sum {@link #TOTAL_WEIGHT}) and a detail line written for the user —
 * what's wrong and what to aim for, never just "failed". Pure and static so every rule is unit-tested.
 */
final class AtsChecks {

    record Check(String id, String label, boolean passed, int weight, String detail) {}

    static final int TOTAL_WEIGHT = 100;

    private static final Pattern NUMBER = Pattern.compile("(\\d|%|\\$|€|£)");
    private static final Pattern FIRST_PERSON = Pattern.compile("(?i)(^|\\W)(i|my|me)(\\W|$)");
    private static final Pattern DUTY_PHRASE = Pattern.compile("(?i)^(responsible for|duties (included|include)|tasked with|worked on|helped (with|to))\\b");
    private static final Pattern YEAR = Pattern.compile("(19|20)\\d{2}");
    private static final Pattern MONTH_NUM = Pattern.compile("^(\\d{1,2})[/.-](\\d{4})$|^(\\d{4})[/.-](\\d{1,2})$");
    private static final Pattern PRESENT = Pattern.compile("(?i)^(present|current|now|today|ongoing)$");

    /** Opening verbs that read as results, not duties. Lower-case; matched on a bullet's first word. */
    private static final Set<String> ACTION_VERBS = Set.of(
        "achieved", "architected", "automated", "boosted", "built", "championed", "consolidated", "coordinated", "created",
        "cut", "decreased", "delivered", "designed", "developed", "directed", "doubled", "drove", "eliminated",
        "engineered", "established", "expanded", "generated", "grew", "implemented", "improved", "increased",
        "introduced", "launched", "led", "managed", "mentored", "migrated", "modernized", "negotiated", "optimized",
        "orchestrated", "overhauled", "owned", "pioneered", "produced", "published", "raised", "redesigned", "reduced",
        "refactored", "resolved", "restructured", "saved", "scaled", "secured", "shipped", "simplified", "spearheaded",
        "streamlined", "strengthened", "taught", "tripled", "trained", "transformed", "won", "wrote", "analyzed",
        "authored", "collaborated", "configured", "deployed", "executed", "facilitated", "founded", "headed", "hired",
        "integrated", "maintained", "operated", "organized", "partnered", "planned", "prototyped", "rebuilt", "researched",
        "supervised", "tested", "upgraded"
    );

    private AtsChecks() {}

    static List<Check> run(JsonNode p, boolean hasFile) {
        List<Check> out = new ArrayList<>();
        String summary = p.path("summary").asText("").trim();
        List<String> skills = new ArrayList<>();
        p.path("skills").forEach(s -> {
            if (!s.asText("").isBlank()) skills.add(s.asText().trim());
        });
        JsonNode exp = p.path("experience");
        List<String> bullets = new ArrayList<>();
        exp.forEach(e -> e.path("bullets").forEach(b -> {
            if (!b.asText("").isBlank()) bullets.add(b.asText().trim());
        }));
        int roles = exp.size();

        // 1–2. Summary: present, and a skim-able length.
        out.add(new Check("summary", "Has a summary", !summary.isEmpty(), 5,
            summary.isEmpty() ? "Add 2–3 sentences at the top saying what you do and for whom." : "Present."));
        out.add(new Check("summary-length", "Summary is a readable length", !summary.isEmpty() && summary.length() >= 120 && summary.length() <= 800, 3,
            summary.isEmpty() ? "No summary yet." : summary.length() < 120 ? "Short (" + summary.length() + " characters) — aim for 120–800." :
                summary.length() > 800 ? "Long (" + summary.length() + " characters) — trim to under 800." : "Good length."));

        // 3–4. Skills: a real section, not a keyword dump.
        out.add(new Check("skills", "Lists your skills", skills.size() >= 5, 8,
            skills.size() >= 5 ? skills.size() + " skills listed." : "Only " + skills.size() + " skills — list at least 5 so an ATS can match you."));
        out.add(new Check("skills-focus", "Skills stay focused", !skills.isEmpty() && skills.size() <= 40, 3,
            skills.isEmpty() ? "No skills yet." : skills.size() <= 40 ? "Focused." : skills.size() + " skills reads as keyword stuffing — keep the 20–40 that matter."));

        // 5–8. Experience: there, labelled, dated, and in a sensible order.
        out.add(new Check("experience", "Has work experience", roles >= 1, 10,
            roles >= 1 ? roles + (roles == 1 ? " role." : " roles.") : "No roles found — an ATS ranks experience first."));
        int unlabelled = 0, undated = 0, backwards = 0;
        for (JsonNode e : exp) {
            if (e.path("title").asText("").isBlank() || e.path("company").asText("").isBlank()) unlabelled++;
            String start = e.path("startDate").asText("").trim();
            if (start.isEmpty()) undated++;
            Integer s = monthIndex(start);
            boolean current = e.path("current").asBoolean(false) || PRESENT.matcher(e.path("endDate").asText("").trim()).matches();
            Integer en = current ? null : monthIndex(e.path("endDate").asText("").trim());
            if (s != null && en != null && en < s) backwards++;
        }
        out.add(new Check("roles-labelled", "Every role has a title and employer", roles > 0 && unlabelled == 0, 6,
            roles == 0 ? "No roles yet." : unlabelled == 0 ? "All labelled." : unlabelled + " role(s) missing a title or employer."));
        out.add(new Check("roles-dated", "Every role has a start date", roles > 0 && undated == 0, 6,
            roles == 0 ? "No roles yet." : undated == 0 ? "All dated." : undated + " role(s) have no start date — ATSs compute experience from dates."));
        out.add(new Check("dates-consistent", "Dates make sense", roles > 0 && backwards == 0, 4,
            roles == 0 ? "No roles yet." : backwards == 0 ? "No role ends before it starts." : backwards + " role(s) end before they start."));

        // 9–10. Bullets: enough of them on recent roles, each a readable length.
        int thin = 0, i = 0;
        for (JsonNode e : exp) {
            if (i++ >= 3) break;
            int n = 0;
            for (JsonNode b : e.path("bullets")) if (!b.asText("").isBlank()) n++;
            if (n < 2) thin++;
        }
        out.add(new Check("bullets", "Recent roles have bullet points", roles > 0 && thin == 0, 8,
            roles == 0 ? "No roles yet." : thin == 0 ? "Each recent role has 2 or more." : thin + " of your latest roles have fewer than 2 bullets."));
        long wordy = bullets.stream().filter(b -> b.length() > 300).count();
        long stubby = bullets.stream().filter(b -> b.length() < 30).count();
        out.add(new Check("bullet-length", "Bullets are a skim-able length", !bullets.isEmpty() && wordy == 0 && stubby * 4 <= bullets.size(), 5,
            bullets.isEmpty() ? "No bullets yet." : wordy > 0 ? wordy + " bullet(s) over 300 characters — split or trim them." :
                stubby * 4 > bullets.size() ? stubby + " bullets are very short — say what you did and what changed." : "Good length."));

        // 11. Measurable results: a third of bullets with a number, percentage or amount.
        long measured = bullets.stream().filter(b -> NUMBER.matcher(b).find()).count();
        boolean enoughNumbers = !bullets.isEmpty() && measured * 3 >= bullets.size();
        out.add(new Check("results", "Shows measurable results", enoughNumbers, 12,
            bullets.isEmpty() ? "No bullets yet." : measured + " of " + bullets.size() + " bullets have a number" +
                (enoughNumbers ? "." : " — aim for at least a third (how much, how many, how fast).")));

        // 12. Action verbs, not duties.
        long strong = bullets.stream().filter(AtsChecks::startsWithActionVerb).count();
        long duties = bullets.stream().filter(b -> DUTY_PHRASE.matcher(b).find()).count();
        boolean verbs = !bullets.isEmpty() && strong * 2 >= bullets.size() && duties == 0;
        out.add(new Check("action-verbs", "Bullets start with action verbs", verbs, 10,
            bullets.isEmpty() ? "No bullets yet." : duties > 0 ? duties + " bullet(s) open with a duty (“Responsible for…”) — lead with what you did." :
                strong + " of " + bullets.size() + " open with a strong verb" + (verbs ? "." : " — aim for at least half (Built, Led, Reduced…).")));

        // 13. No first person.
        long firstPerson = bullets.stream().filter(b -> FIRST_PERSON.matcher(b).find()).count();
        out.add(new Check("no-first-person", "No “I” or “my” in bullets", !bullets.isEmpty() && firstPerson == 0, 4,
            bullets.isEmpty() ? "No bullets yet." : firstPerson == 0 ? "None." : firstPerson + " bullet(s) use I/my/me — resumes drop the pronoun."));

        // 14. Education.
        boolean edu = false;
        for (JsonNode e : p.path("education")) if (!e.path("school").asText("").isBlank() || !e.path("degree").asText("").isBlank()) edu = true;
        out.add(new Check("education", "Lists education", edu, 6, edu ? "Present." : "No education found — many ATS filters check for it."));

        // 15. A real file to send.
        out.add(new Check("file", "Has a file attached", hasFile, 10,
            hasFile ? "A file is on record for this resume." : "No file — applications need the document itself. Upload one on the Resumes page."));
        return out;
    }

    static int passedWeight(List<Check> checks) {
        return checks.stream().filter(Check::passed).mapToInt(Check::weight).sum();
    }

    static boolean startsWithActionVerb(String bullet) {
        String first = bullet.replaceAll("^[\\s\\-–—•*·]+", "").split("\\s+", 2)[0].toLowerCase(Locale.ROOT).replaceAll("[^a-z]", "");
        return ACTION_VERBS.contains(first);
    }

    /** A date as months since year 0, or null when it can't be read ("2020", "Jan 2020", "03/2021", "2021-03"). */
    static Integer monthIndex(String s) {
        if (s == null || s.isBlank()) return null;
        String t = s.trim();
        Matcher mn = MONTH_NUM.matcher(t);
        if (mn.matches()) {
            int month = Integer.parseInt(mn.group(1) != null ? mn.group(1) : mn.group(4));
            int year = Integer.parseInt(mn.group(2) != null ? mn.group(2) : mn.group(3));
            return month >= 1 && month <= 12 ? year * 12 + month - 1 : null;
        }
        Matcher y = YEAR.matcher(t);
        if (!y.find()) return null;
        int year = Integer.parseInt(y.group());
        String lc = t.toLowerCase(Locale.ROOT);
        String[] months = { "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec" };
        for (int m = 0; m < 12; m++) if (lc.contains(months[m])) return year * 12 + m;
        return year * 12; // a year alone counts as January — only used to catch a role ending before it starts
    }
}
