package com.dossier.api.service.inbox;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.ApplicationKeys;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Which tracked application an email is about, and what it does to it (Phase 14.4a).
 *
 * <p><b>Matching</b> (a reply to a thread is followed before this is asked): the application's company
 * — as {@link ApplicationKeys} compares companies — must be what the mail names, or appear in the
 * sender's own domain ({@code jane@acmecorp.com}), their display name ("Acme Recruiting"), or the
 * subject. One application at that company: that's it. Several: the mail's role must pick one out
 * (the role named in the mail, or the title found in the subject). Still several — two Acme roles,
 * no role named — and it's left unmatched rather than guessed: a rejection on the wrong application
 * is worse than none. Archived applications are never matched. When the same role was tracked
 * twice (re-applied), the one sent from this inbox's address wins, else the newest.
 *
 * <p><b>Status</b> only moves forward, and decisions win: see {@link #next}.
 */
public final class MailMatcher {

    private MailMatcher() {}

    /**
     * @param inboxAddress the connected Gmail — applications sent from it are preferred
     */
    public static Optional<Application> match(
        List<Application> applications,
        String companyGuess,
        String roleGuess,
        String subject,
        String fromAddress,
        String fromName,
        String inboxAddress
    ) {
        String guessKey = ApplicationKeys.company(companyGuess);
        String senderDomain = JobMailRules.isHiringDomain(JobMailRules.domainOf(fromAddress)) ? "" : compact(JobMailRules.domainOf(fromAddress));
        String name = compact(fromName);
        String subj = compact(subject);

        List<Application> byCompany = new ArrayList<>();
        for (Application a : applications) {
            if (Boolean.TRUE.equals(a.getArchived())) continue;
            String key = ApplicationKeys.company(a.getCompany());
            if (key.length() < 3) continue;
            boolean hit =
                key.equals(guessKey) ||
                (!senderDomain.isEmpty() && senderDomain.contains(key)) ||
                (!name.isEmpty() && name.contains(key)) ||
                (key.length() >= 4 && subj.contains(key));
            if (hit) byCompany.add(a);
        }
        if (byCompany.size() <= 1) return byCompany.stream().findFirst();

        // Several at that company: the role has to decide.
        String role = ApplicationKeys.title(roleGuess);
        String subjTitle = " " + ApplicationKeys.title(subject) + " ";
        List<Application> byRole = byCompany
            .stream()
            .filter(a -> {
                String t = ApplicationKeys.title(a.getRoleTitle());
                return !t.isEmpty() && (t.equals(role) || subjTitle.contains(" " + t + " "));
            })
            .toList();
        if (byRole.size() == 1) return Optional.of(byRole.get(0));
        List<Application> pool = byRole.isEmpty() ? byCompany : byRole;
        // Same role twice (re-applied): the one sent from this inbox, else the newest.
        if (!byRole.isEmpty()) {
            return pool
                .stream()
                .sorted(
                    Comparator.comparing((Application a) -> sentFromHere(a, inboxAddress) ? 0 : 1).thenComparing(
                        Application::getCreatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())
                    )
                )
                .findFirst();
        }
        return Optional.empty();
    }

    /** What the matcher is told about one mail. {@code threadApplicationId} is the application the mail it replies to went to (or null). */
    public record Facts(
        String companyGuess,
        String roleGuess,
        String subject,
        String body,
        String fromAddress,
        String fromName,
        String inboxAddress,
        Long threadApplicationId
    ) {}

    /**
     * The ranked answer. {@code best} is null when nothing matched <em>or</em> when two different jobs were
     * too close ({@code ambiguous}); the candidates are then all there is to show a person.
     */
    public record Ranking(Application best, MailEvent.MatchKind kind, int score, boolean ambiguous, List<MailEvent.Candidate> candidates) {}

    private static final Pattern URL = Pattern.compile("https?://[^\\s<>\"')\\]]+", Pattern.CASE_INSENSITIVE);

    /**
     * Ranked matching, strongest evidence first: the ATS application / requisition id, a job link in the mail,
     * the thread, then company (+ role). Every signal is scored in {@link MailConfidence}; the best two different jobs
     * within {@link MailConfidence#AMBIGUOUS_GAP} points are never chosen between. The same job tracked twice
     * (re-applied) counts as one job: the one sent from this inbox's address wins, else the newest.
     */
    public static Ranking rank(List<Application> applications, Facts f) {
        String guessKey = ApplicationKeys.company(f.companyGuess());
        String senderDomainRaw = JobMailRules.domainOf(f.fromAddress());
        String senderDomain = JobMailRules.isHiringDomain(senderDomainRaw) ? "" : compact(senderDomainRaw);
        String name = compact(f.fromName());
        String subj = compact(f.subject());
        String role = ApplicationKeys.title(f.roleGuess());
        String subjTitle = " " + ApplicationKeys.title(f.subject()) + " ";
        String text = (f.subject() == null ? "" : f.subject()) + "\n" + (f.body() == null ? "" : f.body());
        List<String> links = new ArrayList<>();
        Matcher um = URL.matcher(text);
        while (um.find() && links.size() < 40) links.add(ApplicationKeys.url(um.group()));

        record Scored(Application app, int score, MailEvent.MatchKind kind, String reason) {}
        List<Scored> scored = new ArrayList<>();
        for (Application a : applications) {
            if (Boolean.TRUE.equals(a.getArchived())) continue;
            String key = ApplicationKeys.company(a.getCompany());
            boolean keyOk = key.length() >= 3;
            boolean viaGuess = keyOk && key.equals(guessKey);
            boolean viaDomain = keyOk && !senderDomain.isEmpty() && senderDomain.contains(key);
            boolean viaName = keyOk && !name.isEmpty() && name.contains(key);
            boolean company = viaGuess || viaDomain || viaName;
            boolean subjectOnly = !company && keyOk && key.length() >= 4 && subj.contains(key);
            String title = ApplicationKeys.title(a.getRoleTitle());
            boolean roleOk = !title.isEmpty() && (title.equals(role) || subjTitle.contains(" " + title + " "));
            boolean thread = f.threadApplicationId() != null && f.threadApplicationId().equals(a.getId());
            MailConfidence.MatchSignals s = new MailConfidence.MatchSignals(
                containsAtsId(text, a.getExternalJobId()),
                linksTo(links, a.getJobUrl()),
                thread,
                company,
                subjectOnly,
                roleOk,
                viaDomain
            );
            int score = MailConfidence.match(s);
            MailEvent.MatchKind kind = MailConfidence.kind(s);
            if (kind == MailEvent.MatchKind.NONE || score <= 0) continue;
            scored.add(new Scored(a, score, kind, reason(kind)));
        }
        if (scored.isEmpty()) return new Ranking(null, MailEvent.MatchKind.NONE, 0, false, List.of());
        scored.sort(Comparator.comparingInt(Scored::score).reversed());

        // The same job tracked twice is one job: keep the one sent from here, else the newest.
        List<Scored> jobs = new ArrayList<>();
        for (Scored c : scored) {
            Scored same = null;
            for (int i = 0; i < jobs.size(); i++) {
                if (sameJob(jobs.get(i).app(), c.app())) {
                    same = jobs.get(i);
                    break;
                }
            }
            if (same == null) {
                jobs.add(c);
            } else if (c.score() == same.score() && prefer(c.app(), same.app(), f.inboxAddress())) {
                jobs.set(jobs.indexOf(same), c);
            }
        }
        List<MailEvent.Candidate> candidates = new ArrayList<>();
        for (Scored c : jobs) {
            candidates.add(new MailEvent.Candidate(c.app().getId(), c.score(), c.kind(), c.reason(), c.app().getCompany(), c.app().getRoleTitle()));
        }
        Scored top = jobs.get(0);
        if (jobs.size() > 1 && top.score() - jobs.get(1).score() <= MailConfidence.AMBIGUOUS_GAP) {
            return new Ranking(null, MailEvent.MatchKind.AMBIGUOUS, top.score(), true, candidates);
        }
        return new Ranking(top.app(), top.kind(), top.score(), false, candidates);
    }

    private static String reason(MailEvent.MatchKind k) {
        return switch (k) {
            case ATS_ID -> "The mail carries this application's ATS id.";
            case JOB_LINK -> "The mail links to this application's job.";
            case THREAD -> "A reply to a mail already linked to this application.";
            case COMPANY_ROLE -> "Company and role agree.";
            case COMPANY -> "Only the company agrees.";
            default -> "";
        };
    }

    private static boolean sameJob(Application a, Application b) {
        return (
            ApplicationKeys.company(a.getCompany()).equals(ApplicationKeys.company(b.getCompany())) &&
            ApplicationKeys.title(a.getRoleTitle()).equals(ApplicationKeys.title(b.getRoleTitle()))
        );
    }

    /** True when {@code c} should win over {@code held} for the same job and equal score. */
    private static boolean prefer(Application c, Application held, String inboxAddress) {
        boolean cs = sentFromHere(c, inboxAddress), hs = sentFromHere(held, inboxAddress);
        if (cs != hs) return cs;
        return c.getCreatedAt() != null && (held.getCreatedAt() == null || c.getCreatedAt().isAfter(held.getCreatedAt()));
    }

    private static boolean containsAtsId(String text, String id) {
        if (id == null) return false;
        String t = id.trim();
        if (t.length() < 5 || text.isEmpty()) return false;
        return Pattern.compile("(?<![A-Za-z0-9])" + Pattern.quote(t) + "(?![A-Za-z0-9])", Pattern.CASE_INSENSITIVE).matcher(text).find();
    }

    private static boolean linksTo(List<String> mailLinks, String jobUrl) {
        if (jobUrl == null || jobUrl.isBlank() || mailLinks.isEmpty()) return false;
        String want = ApplicationKeys.url(jobUrl);
        int slash = want.indexOf('/');
        if (slash < 0 || want.length() - slash <= 3) return false; // a bare host or a one-segment path names no job
        for (String l : mailLinks) {
            if (l.equals(want) || l.startsWith(want + "/") || l.startsWith(want + "?")) return true;
        }
        return false;
    }

    /**
     * The status an email moves an application to, or null to leave it. Forward only — an old
     * "thanks for applying" never pulls an interview back to Applied — and decisions win: a rejection
     * from anywhere short of an offer, an offer from anywhere. An interview invite after a rejection
     * is left alone (more likely another role than a reversal).
     */
    public static ApplicationStatus next(ApplicationStatus current, MailClassifier.Category category) {
        ApplicationStatus c = current == null ? ApplicationStatus.DRAFT : current;
        // WITHDRAWN is the user's own decision: mail never moves an application out of it.
        if (c == ApplicationStatus.WITHDRAWN) return null;
        return switch (category) {
            case APPLIED, ASSESSMENT -> c == ApplicationStatus.DRAFT || c == ApplicationStatus.SAVED ? ApplicationStatus.APPLIED : null;
            // "Under review" sits between applied and interview: it moves an entry that is earlier, never one that is later.
            case IN_REVIEW -> c == ApplicationStatus.DRAFT || c == ApplicationStatus.SAVED || c == ApplicationStatus.APPLIED
                ? ApplicationStatus.IN_REVIEW
                : null;
            case INTERVIEW -> c == ApplicationStatus.DRAFT || c == ApplicationStatus.SAVED || c == ApplicationStatus.APPLIED || c == ApplicationStatus.IN_REVIEW
                ? ApplicationStatus.INTERVIEW
                : null;
            case OFFER -> c == ApplicationStatus.OFFER ? null : ApplicationStatus.OFFER;
            case REJECTED -> c == ApplicationStatus.REJECTED || c == ApplicationStatus.OFFER ? null : ApplicationStatus.REJECTED;
            default -> null;
        };
    }

    private static boolean sentFromHere(Application a, String inboxAddress) {
        return a.getEmail() != null && inboxAddress != null && a.getEmail().trim().equalsIgnoreCase(inboxAddress.trim());
    }

    private static String compact(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", "");
    }
}
