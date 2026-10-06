package com.dossier.api.service.inbox;

import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What a job email says (Phase 14.4a), by rules first — the ROADMAP's "deterministic first". The
 * phrases are the ones hiring systems' templates actually use (Greenhouse, Lever, Ashby, Workday,
 * iCIMS confirmations; the standard rejection and interview-invite wordings). When the rules find
 * one clear answer the mail is settled here, free; when they find nothing, or two answers that
 * contradict each other ("unfortunately I need to move our interview"), it's {@code ambiguous} and
 * goes to the model — the only mail that does.
 *
 * <p>Also pulls out what the mail says the job is — the company and the role — for matching it to an
 * application, or suggesting one.
 */
public final class MailClassifier {

    public enum Category {
        APPLIED,
        INTERVIEW,
        ASSESSMENT,
        REJECTED,
        OFFER,
        /** Job alerts and newsletters from boards — not about one of the user's applications. */
        ALERT,
        OTHER,
    }

    /**
     * @param category  the reading; {@code OTHER} when there's none
     * @param ambiguous true when the rules couldn't settle it — the model should read it
     */
    public record Reading(Category category, boolean ambiguous, String company, String role) {}

    private static final Pattern ALERT = p(
        "job alert|jobs? (you may|you might|for you|matching|that match)|recommended jobs|new jobs? (in|near|for)|is hiring|" +
        "top job picks|jobs similar to|people also viewed|your job search|weekly digest|apply now to"
    );
    private static final Pattern OFFER = p(
        "pleased to (offer|extend)|offer letter|extend (you )?(an|a formal|a verbal|our) offer|offer of employment|" +
        "formal offer|your offer (details|package)|we('d| would) like to offer you"
    );
    private static final Pattern REJECTED_STRONG = p(
        "not (to )?(be )?(mov(e|ing)|proceed(ing)?|progress(ing)?) forward|decided to (move|go) (forward|ahead) with other|" +
        "pursu(e|ing) other candidates|no longer (being )?considered|will not be (moving|progressing|proceeding)|" +
        "position has (now )?been filled|role has (now )?been filled|not (been )?selected|regret to inform|" +
        "candidates whose (experience|background|qualifications)|closer (match|fit)|won't be moving forward|" +
        "we have decided not to|not the right fit|unable to offer you"
    );
    private static final Pattern REJECTED_WEAK = p("unfortunately|we (will|won't) keep your (resume|application) on file");
    private static final Pattern INTERVIEW = p(
        "schedul(e|ing) (an |a |your |the )?(interview|call|chat|conversation|time|phone screen)|interview (invitation|request|invite)|" +
        "invite you to (an |a )?(interview|call|chat|conversation|onsite)|phone screen|(your|my|share your|send your) availability|" +
        "book a time|next round|move (you )?(forward|on) to (the )?(next|an?)|(like|love) to (speak|chat|talk|connect) (with you|about)|" +
        "calendly\\.com|goodtime\\.io|interview (with|for)|onsite interview|virtual interview"
    );
    private static final Pattern ASSESSMENT = p(
        "assessment|coding (challenge|exercise|test)|take[- ]home|hackerrank|codesignal|codility|online test|skills test"
    );
    private static final Pattern APPLIED = p(
        "thank(s| you) for (applying|your application|your interest|submitting)|(we('ve| have)|has been) received your application|" +
        "application (has been )?(received|submitted)|successfully (applied|submitted)|your application (to|for|with)|" +
        "we received your application|application confirmation|thanks for applying"
    );

    // What the mail says the job is.
    private static final Pattern COMPANY_AFTER = Pattern.compile(
        "(?:applying|application|interest|applied)\\s+(?:to|at|with|for)\\s+(?:the\\s+.{3,80}?\\s+(?:position|role|opening)\\s+at\\s+)?" +
        "([A-Z][\\w&.'’-]*(?:\\s+[A-Z][\\w&.'’-]*){0,4})"
    );
    private static final Pattern ROLE_BEFORE_AT = Pattern.compile(
        "(?:for|as|to)\\s+(?:the\\s+|our\\s+|an?\\s+)?([A-Z][\\w/&,+#().'’ -]{2,80}?)\\s+(?:position|role|opening|job)\\b"
    );
    private static final Pattern ROLE_ROLE_AT = Pattern.compile("([A-Z][\\w/&+#().'’ -]{2,80}?)\\s+(?:role|position)?\\s*at\\s+([A-Z][\\w&.'’-]*(?:\\s+[A-Z][\\w&.'’-]*){0,3})");
    private static final Pattern FROM_NAME_COMPANY = Pattern.compile(
        "(?i)^(.{2,60}?)\\s+(?:recruiting|recruitment|talent(?: acquisition)?|careers|hiring(?: team)?|people(?: team)?|jobs|hr)\\b"
    );

    private MailClassifier() {}

    public static Reading read(String subject, String body, String fromName) {
        String subj = subject == null ? "" : subject;
        String text = subj + "\n" + (body == null ? "" : body);
        String company = companyFrom(subj, body, fromName);
        String role = roleFrom(subj, body);

        Set<Category> strong = EnumSet.noneOf(Category.class);
        if (OFFER.matcher(text).find()) strong.add(Category.OFFER);
        if (REJECTED_STRONG.matcher(text).find()) strong.add(Category.REJECTED);
        if (INTERVIEW.matcher(text).find()) strong.add(Category.INTERVIEW);
        if (ASSESSMENT.matcher(text).find()) strong.add(Category.ASSESSMENT);
        boolean applied = APPLIED.matcher(text).find();
        boolean weakReject = REJECTED_WEAK.matcher(text).find();

        // Alerts are only alerts when nothing about the user's own application is said.
        if (strong.isEmpty() && !applied && ALERT.matcher(text).find()) return new Reading(Category.ALERT, false, company, role);

        // A decision outranks everything; two decisions that disagree need a reader.
        if (strong.contains(Category.OFFER) && strong.contains(Category.REJECTED)) return new Reading(Category.OTHER, true, company, role);
        if (strong.contains(Category.OFFER)) return new Reading(Category.OFFER, false, company, role);
        if (strong.contains(Category.REJECTED)) {
            boolean conflict = strong.contains(Category.INTERVIEW) || strong.contains(Category.ASSESSMENT);
            return new Reading(Category.REJECTED, conflict, company, role);
        }
        if (strong.contains(Category.INTERVIEW)) return new Reading(Category.INTERVIEW, weakReject, company, role);
        if (strong.contains(Category.ASSESSMENT)) return new Reading(Category.ASSESSMENT, weakReject, company, role);
        if (applied) return new Reading(Category.APPLIED, weakReject, company, role);
        // "Unfortunately…" with nothing else: probably a rejection in words the rules don't know.
        return new Reading(Category.OTHER, true, company, role);
    }

    static String companyFrom(String subject, String body, String fromName) {
        for (String s : new String[] { subject, head(body) }) {
            if (s == null) continue;
            Matcher m = COMPANY_AFTER.matcher(s);
            if (m.find()) return clean(m.group(1));
            Matcher r = ROLE_ROLE_AT.matcher(s);
            if (r.find()) return clean(r.group(2));
        }
        if (fromName != null) {
            String n = fromName.replaceAll("(?i)\\s+via\\s+.*$", "").trim();
            Matcher m = FROM_NAME_COMPANY.matcher(n);
            if (m.find()) return clean(m.group(1));
        }
        return null;
    }

    static String roleFrom(String subject, String body) {
        for (String s : new String[] { subject, head(body) }) {
            if (s == null) continue;
            Matcher m = ROLE_BEFORE_AT.matcher(s);
            if (m.find()) return clean(m.group(1));
            Matcher r = ROLE_ROLE_AT.matcher(s);
            if (r.find() && !r.group(1).toLowerCase(Locale.ROOT).matches(".*(thank|application|interest|applying).*")) return clean(r.group(1));
        }
        return null;
    }

    private static String head(String body) {
        if (body == null) return null;
        return body.length() > 1500 ? body.substring(0, 1500) : body;
    }

    private static String clean(String s) {
        if (s == null) return null;
        String t = s.replaceAll("[\\s.,!:;'’-]+$", "").replaceAll("^(the|our|an?)\\s+", "").trim();
        return t.isEmpty() || t.length() > 120 ? null : t;
    }

    private static Pattern p(String regex) {
        return Pattern.compile("(?i)\\b(?:" + regex + ")");
    }
}
