package com.dossier.api.service.inbox;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.ApplicationKeys;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

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

    /**
     * The status an email moves an application to, or null to leave it. Forward only — an old
     * "thanks for applying" never pulls an interview back to Applied — and decisions win: a rejection
     * from anywhere short of an offer, an offer from anywhere. An interview invite after a rejection
     * is left alone (more likely another role than a reversal).
     */
    public static ApplicationStatus next(ApplicationStatus current, MailClassifier.Category category) {
        ApplicationStatus c = current == null ? ApplicationStatus.DRAFT : current;
        return switch (category) {
            case APPLIED, ASSESSMENT -> c == ApplicationStatus.DRAFT || c == ApplicationStatus.SAVED ? ApplicationStatus.APPLIED : null;
            case INTERVIEW -> c == ApplicationStatus.DRAFT || c == ApplicationStatus.SAVED || c == ApplicationStatus.APPLIED
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
