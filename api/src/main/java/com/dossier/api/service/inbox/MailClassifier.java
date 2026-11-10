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

    /** What a category is allowed to do to an application. The one table the parser, the policy and the tests read. */
    public enum Effect {
        /** May move the application's status (forward only, see {@link MailMatcher#next}). */
        STATUS,
        /** Writes a timeline event only; the status never changes. */
        TIMELINE_ONLY,
        /** May create a suggested application only; never changes an existing one. */
        SUGGESTION_ONLY,
        /** Not about an application: stored, never acted on. */
        NONE,
    }

    public enum Category {
        APPLIED(Effect.STATUS),
        /** "Your application is under review": past the receipt, before any interview. */
        IN_REVIEW(Effect.STATUS),
        INTERVIEW(Effect.STATUS),
        ASSESSMENT(Effect.STATUS),
        REJECTED(Effect.STATUS),
        OFFER(Effect.STATUS),
        /** Job alerts and digests from boards - not about one of the user's applications. */
        ALERT(Effect.NONE),
        OTHER(Effect.NONE),
        /** A recruiter writes about a role the person did not apply to: a suggestion at most. */
        RECRUITER_OUTREACH(Effect.SUGGESTION_ONLY),
        /** The position was filled, closed or is no longer accepting applications: a note on the timeline, no status change. */
        APPLICATION_CLOSED(Effect.TIMELINE_ONLY),
        /** "Your assessment is due soon": a note on the timeline; the status already moved with the invitation. */
        ASSESSMENT_REMINDER(Effect.TIMELINE_ONLY),
        /** Newsletters, marketing and promotions: not job mail. */
        NEWSLETTER(Effect.NONE);

        private final Effect effect;

        Category(Effect effect) {
            this.effect = effect;
        }

        public Effect effect() {
            return effect;
        }

        public boolean mayChangeStatus() {
            return effect == Effect.STATUS;
        }
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
        "not (been )?selected|regret to inform|" +
        "candidates whose (experience|background|qualifications)|closer (match|fit)|won't be moving forward|" +
        "we have decided not to|not the right fit|unable to offer you"
    );
    // The job went away; the person was not turned down. "Regret to inform ... filled" still reads as a rejection (REJECTED_STRONG wins).
    private static final Pattern CLOSED = p(
        "(position|role|job|opening|vacancy|requisition|search) (has|have|is|was) (now |since |already )?(been )?(filled|closed|cancel(l)?ed|withdrawn|put on hold|on hold)|" +
        "(position|role|job|opening) (is )?no longer (available|open|accepting)|no longer (accepting|taking) applications|" +
        "(job )?posting (has )?(been )?(closed|removed|expired)|we (have )?(closed|cancel(l)?ed) (this|the) (position|role|search|opening)|" +
        "stopped accepting applications|hiring (for this (role|position) )?(has been )?(paused|frozen)"
    );
    // The sender found the person; nothing in the mail says they applied.
    private static final Pattern COLD = p(
        "came across your (profile|resume|cv|linkedin|background|work)|found your (profile|resume|cv|linkedin)|saw your (profile|resume|cv|linkedin)|" +
        "reaching out (to you )?(about|regarding|because|with|on behalf)|your (background|profile|experience) (caught|stood out|looks|is (a )?(great|strong))|" +
        "are you (currently )?(open to (new |exploring |hearing about |a new )|interested in (a |an |new |this |the |exploring |hearing))|open to (new |exploring |hearing about )?(opportunit|a new|new roles|roles)|exciting (opportunity|role|position)|" +
        "i('m| am) a (senior |technical |lead )?(recruiter|sourcer|talent)|(we have|i have|i've got|i got) an? (role|position|opening|opportunity)|" +
        "(role|position|opportunity) (that )?(i think|might|may|would) (be )?(a )?(good )?(fit|interest)"
    );
    private static final Pattern YOUR_APPLICATION = p("your (application|candidacy)|you applied|you('ve| have) applied|thank(s| you) for applying");
    private static final Pattern REMINDER = p(
        "reminder|friendly nudge|haven'?t (yet )?(started|completed|finished|submitted)|not (yet )?(started|completed|finished)|still (waiting|pending|open)|" +
        "(is|are) (almost |nearly )?(due|expiring)|due (soon|tomorrow|today)|expires? (in|soon|tomorrow|today)|last chance"
    );
    // Marketing and digest wording. A bare "unsubscribe" footer is a weaker sign (UNSUBSCRIBE): it counts only when the mail says nothing about an application.
    private static final Pattern NEWSLETTER = p(
        "newsletter|weekly (roundup|round-up|update|digest)|monthly (digest|update)|daily digest|webinar|\\d+% off|limited[- ]time|special offer|" +
        "career (tips|advice) (for|from)|(read|view) (this email )?in (your )?browser|you('re| are) receiving this (email |message )?because you (subscribed|signed up|opted)"
    );
    private static final Pattern UNSUBSCRIBE = p("unsubscribe|manage (your )?(email )?(preferences|subscriptions?)|email preferences|opt[- ]out");
    private static final Pattern REJECTED_WEAK= p("unfortunately|we (will|won't) keep your (resume|application) on file");
    private static final Pattern INTERVIEW = p(
        "schedul(e|ing) (an |a |your |the )?(interview|call|chat|conversation|time|phone screen)|interview (invitation|request|invite)|" +
        "invite you to (an |a )?(interview|call|chat|conversation|onsite)|phone screen|(your|my|share your|send your) availability|" +
        "book a time|next round|move (you )?(forward|on) to (the )?(next|an?)|(like|love) to (speak|chat|talk|connect) (with you|about)|" +
        "calendly\\.com|goodtime\\.io|interview (with|for)|onsite interview|virtual interview"
    );
    // An interview that is called off or moved: still an interview mail (the schedule reader tells the two apart), and "unfortunately" in it is not a rejection.
    private static final Pattern INTERVIEW_WORD = p("interview|call|meeting|chat|conversation|phone screen|screening|session");
    private static final Pattern ASSESSMENT = p(
        "assessment|coding (challenge|exercise|test)|take[- ]home|hackerrank|codesignal|codility|online test|skills test"
    );
    private static final Pattern APPLIED = p(
        "thank(s| you) for (applying|your application|your interest|submitting)|(we('ve| have)|has been) received your application|" +
        "application (has been )?(received|submitted)|successfully (applied|submitted)|your application (to|for|with)|" +
        "we received your application|application confirmation|thanks for applying"
    );

    // A receipt: the first mail after applying. Boilerplate like "our team will review your application"
    // appears in these, so a mail that is a receipt is never read as "in review".
    private static final Pattern RECEIPT = p(
        "thank(s| you) for (applying|your application|your interest|submitting)|(we('ve| have)|has been) received your application|" +
        "application (has been )?(received|submitted)|successfully (applied|submitted)|application confirmation|thanks for applying"
    );
    // A status update that says the application is being looked at.
    private static final Pattern IN_REVIEW = p(
        "(your )?application (is|has been|status( is)?:?) ?(currently |now )?(under review|in review|being reviewed|being considered)|" +
        "(application|candidacy) status:? ?(under review|in review)|" +
        "we('re| are) (currently |now )?(reviewing|looking at) your (application|resume|profile|candidacy)|" +
        "(has|have) (now )?(moved|been moved) (your application )?to (the )?(review|screening) (stage|phase)|" +
        "(the )?(hiring team|recruiting team|recruiter) (is|are) (currently )?reviewing your"
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
        boolean change =
            (InterviewScheduleExtractor.CANCEL.matcher(text).find() || InterviewScheduleExtractor.RESCHEDULE.matcher(text).find()) && INTERVIEW_WORD.matcher(text).find();
        if (change) strong.add(Category.INTERVIEW);
        if (ASSESSMENT.matcher(text).find()) strong.add(Category.ASSESSMENT);
        boolean applied = APPLIED.matcher(text).find();
        boolean weakReject = REJECTED_WEAK.matcher(text).find();

        boolean aboutYou = YOUR_APPLICATION.matcher(text).find();
        boolean alert = ALERT.matcher(text).find();
        boolean unsub = UNSUBSCRIBE.matcher(text).find();
        boolean decision = strong.contains(Category.OFFER) || strong.contains(Category.REJECTED);

        // Bulk mail is never about one application. An alert phrase plus an unsubscribe footer is two signs and settles it even when a
        // digest happens to mention "interview with"; either one alone must stand with nothing else strong in the mail.
        boolean bulk = !applied && !aboutYou && !decision && !change && (alert && unsub || strong.isEmpty());
        if (bulk && alert) return new Reading(Category.ALERT, false, company, role);
        if (bulk && (NEWSLETTER.matcher(text).find() || unsub)) return new Reading(Category.NEWSLETTER, false, company, role);

        // A decision outranks everything; two decisions that disagree need a reader.
        if (strong.contains(Category.OFFER) && strong.contains(Category.REJECTED)) return new Reading(Category.OTHER, true, company, role);
        if (strong.contains(Category.OFFER)) return new Reading(Category.OFFER, false, company, role);
        if (strong.contains(Category.REJECTED)) {
            boolean conflict = strong.contains(Category.INTERVIEW) || strong.contains(Category.ASSESSMENT);
            return new Reading(Category.REJECTED, conflict, company, role);
        }
        // The job went away: a note, never a rejection.
        if (CLOSED.matcher(text).find() && !strong.contains(Category.INTERVIEW) && !strong.contains(Category.ASSESSMENT)) {
            return new Reading(Category.APPLICATION_CLOSED, false, company, role);
        }
        // A recruiter who found the person: only when the mail never refers to an application of theirs and no assessment is in play.
        if (!applied && !aboutYou && !strong.contains(Category.ASSESSMENT) && !change && COLD.matcher(text).find()) {
            return new Reading(Category.RECRUITER_OUTREACH, false, company, role);
        }
        if (strong.contains(Category.INTERVIEW)) return new Reading(Category.INTERVIEW, weakReject && !change, company, role);
        if (strong.contains(Category.ASSESSMENT)) {
            // "Your assessment is due soon" is a nudge about a test already sent, not a new test.
            if (REMINDER.matcher(text).find()) return new Reading(Category.ASSESSMENT_REMINDER, false, company, role);
            return new Reading(Category.ASSESSMENT, weakReject, company, role);
        }
        // "Under review" is its own stage, unless the mail is the receipt itself (which says it as boilerplate).
        if (IN_REVIEW.matcher(text).find() && !RECEIPT.matcher(text).find()) return new Reading(Category.IN_REVIEW, weakReject, company, role);
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
