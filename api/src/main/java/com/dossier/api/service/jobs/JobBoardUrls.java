package com.dossier.api.service.jobs;

import java.net.URI;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Which public job board a job link belongs to (Phase 13.6a): the ATS and the board token — the
 * company slug the public API is keyed by. Used to add companies users apply to into the job-match
 * pool. Only hosted board links carry the token; a company's own careers page (e.g. Stripe's
 * {@code stripe.com/jobs?gh_jid=…}) doesn't, and is skipped.
 *
 * <ul>
 *   <li>Greenhouse — {@code boards.greenhouse.io/{token}/jobs/…},
 *       {@code job-boards.greenhouse.io/{token}/jobs/…}, {@code boards.greenhouse.io/embed/job_app?for={token}}.
 *       EU-hosted boards ({@code *.eu.greenhouse.io}) use another API host and are left out.</li>
 *   <li>Lever — {@code jobs.lever.co/{token}/…} (not {@code jobs.eu.lever.co}, same reason).</li>
 *   <li>Ashby — {@code jobs.ashbyhq.com/{token}/…}.</li>
 * </ul>
 */
final class JobBoardUrls {

    record Board(String ats, String token) {}

    /** What a board token may look like — the slug APIs accept; anything else is not a board. */
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,99}");
    private static final Pattern FOR_PARAM = Pattern.compile("(?:^|&)for=([^&]+)");

    private JobBoardUrls() {}

    static Optional<Board> parse(String link) {
        if (link == null || link.isBlank()) return Optional.empty();
        URI u;
        try {
            u = URI.create(link.trim());
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
        String[] path = (u.getPath() == null ? "" : u.getPath()).replaceFirst("^/+", "").split("/");
        String first = path.length > 0 ? path[0] : "";

        if (host.equals("boards.greenhouse.io") || host.equals("job-boards.greenhouse.io")) {
            if (first.equals("embed")) {
                Matcher m = FOR_PARAM.matcher(u.getRawQuery() == null ? "" : u.getRawQuery());
                return m.find() ? board(JobBoardParsers.GREENHOUSE, m.group(1)) : Optional.empty();
            }
            return board(JobBoardParsers.GREENHOUSE, first);
        }
        if (host.equals("jobs.lever.co")) return board(JobBoardParsers.LEVER, first);
        if (host.equals("jobs.ashbyhq.com")) return board(JobBoardParsers.ASHBY, first);
        return Optional.empty();
    }

    private static Optional<Board> board(String ats, String token) {
        return token != null && TOKEN.matcher(token).matches() ? Optional.of(new Board(ats, token)) : Optional.empty();
    }
}
