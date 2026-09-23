package com.dossier.api.service.jobs;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Greenhouse, Lever and Ashby job-board JSON → {@link FetchedPosting} (Phase 13.6a). Field names come
 * from real responses captured 2026-09-22 (Stripe on Greenhouse, Palantir on Lever, Ramp on Ashby):
 *
 * <ul>
 *   <li><b>Greenhouse</b> {@code GET boards-api.greenhouse.io/v1/boards/{token}/jobs} — {@code jobs[]}
 *       with {@code id, title, location.name, absolute_url, company_name, first_published}. No
 *       description in the list; {@code /jobs/{id}} adds {@code content} (HTML, escaped once more).
 *       {@code updated_at} moves on every edit, so freshness reads {@code first_published} only.</li>
 *   <li><b>Lever</b> {@code GET api.lever.co/v0/postings/{token}?mode=json} — an array with
 *       {@code id, text, categories{location, allLocations, commitment, team}, workplaceType,
 *       createdAt} (epoch ms), {@code hostedUrl, applyUrl, descriptionPlain, lists[{text, content}],
 *       additionalPlain}.</li>
 *   <li><b>Ashby</b> {@code GET api.ashbyhq.com/posting-api/job-board/{token}} — {@code jobs[]} with
 *       {@code id, title, location, secondaryLocations[{location}], isRemote, workplaceType
 *       (OnSite|Remote|Hybrid), employmentType, department, publishedAt, isListed, jobUrl, applyUrl,
 *       descriptionPlain}.</li>
 * </ul>
 *
 * A posting without a usable publish time is skipped: freshness is the one gate we can't guess.
 */
final class JobBoardParsers {

    static final String GREENHOUSE = "greenhouse";
    static final String LEVER = "lever";
    static final String ASHBY = "ashby";
    static final Set<String> ATS = Set.of(GREENHOUSE, LEVER, ASHBY);

    /** Description cap — the same bound the AI features put on a job description. */
    static final int MAX_DESCRIPTION = 8000;

    private JobBoardParsers() {}

    /** Greenhouse list → postings without descriptions (fetch {@code /jobs/{id}} for the fresh ones). */
    static List<FetchedPosting> greenhouseList(JsonNode root, String sourceCompany) {
        List<FetchedPosting> out = new ArrayList<>();
        for (JsonNode j : root.path("jobs")) {
            String id = j.path("id").asText("");
            Instant published = instant(j.path("first_published").asText(""));
            String title = j.path("title").asText("").trim();
            String url = j.path("absolute_url").asText("");
            if (id.isEmpty() || published == null || title.isEmpty() || url.isEmpty()) continue;
            String location = j.path("location").path("name").asText("").trim();
            String company = j.path("company_name").asText("").trim();
            out.add(
                posting(
                    id,
                    title,
                    company.isEmpty() ? sourceCompany : company,
                    location,
                    null,
                    mentionsRemote(location) ? Boolean.TRUE : null,
                    null,
                    null,
                    url,
                    url,
                    published,
                    ""
                )
            );
        }
        return out;
    }

    /** A Greenhouse list entry completed from {@code /jobs/{id}}: the description as text, and its department. */
    static FetchedPosting greenhouseDetail(FetchedPosting listed, JsonNode detail) {
        String department = cut(detail.path("departments").path(0).path("name").asText(""), 200);
        return listed.withDetail(HtmlText.toText(detail.path("content").asText(""), MAX_DESCRIPTION), blankToNull(department));
    }

    static List<FetchedPosting> lever(JsonNode root, String sourceCompany) {
        List<FetchedPosting> out = new ArrayList<>();
        if (!root.isArray()) return out;
        for (JsonNode j : root) {
            String id = j.path("id").asText("");
            long created = j.path("createdAt").asLong(0);
            String title = j.path("text").asText("").trim();
            String url = j.path("hostedUrl").asText("");
            if (id.isEmpty() || created <= 0 || title.isEmpty() || url.isEmpty()) continue;
            JsonNode c = j.path("categories");
            Set<String> places = new LinkedHashSet<>();
            c.path("allLocations").forEach(l -> {
                if (!l.asText("").isBlank()) places.add(l.asText().trim());
            });
            if (places.isEmpty() && !c.path("location").asText("").isBlank()) places.add(c.path("location").asText().trim());
            String location = String.join("; ", places);
            String workplace = workplace(j.path("workplaceType").asText(""));

            StringBuilder d = new StringBuilder(j.path("descriptionPlain").asText(""));
            for (JsonNode list : j.path("lists")) {
                d.append("\n\n").append(list.path("text").asText("")).append('\n');
                d.append(HtmlText.toText(list.path("content").asText(""), MAX_DESCRIPTION));
            }
            d.append("\n\n").append(j.path("additionalPlain").asText(""));

            out.add(
                posting(
                    id,
                    title,
                    sourceCompany,
                    location,
                    workplace,
                    "REMOTE".equals(workplace) || mentionsRemote(location) ? Boolean.TRUE : null,
                    c.path("commitment").asText(null),
                    c.path("team").asText(null),
                    url,
                    j.path("applyUrl").asText(url),
                    Instant.ofEpochMilli(created),
                    tidy(d.toString())
                )
            );
        }
        return out;
    }

    static List<FetchedPosting> ashby(JsonNode root, String sourceCompany) {
        List<FetchedPosting> out = new ArrayList<>();
        for (JsonNode j : root.path("jobs")) {
            if (j.has("isListed") && !j.path("isListed").asBoolean(true)) continue;
            String id = j.path("id").asText("");
            Instant published = instant(j.path("publishedAt").asText(""));
            String title = j.path("title").asText("").trim();
            String url = j.path("jobUrl").asText("");
            if (id.isEmpty() || published == null || title.isEmpty() || url.isEmpty()) continue;
            Set<String> places = new LinkedHashSet<>();
            if (!j.path("location").asText("").isBlank()) places.add(j.path("location").asText().trim());
            j.path("secondaryLocations").forEach(l -> {
                if (!l.path("location").asText("").isBlank()) places.add(l.path("location").asText().trim());
            });
            String location = String.join("; ", places);
            String workplace = workplace(j.path("workplaceType").asText(""));
            boolean remote = j.path("isRemote").asBoolean(false) || "REMOTE".equals(workplace) || mentionsRemote(location);
            String description = j.path("descriptionPlain").asText("");
            if (description.isBlank()) description = HtmlText.toText(j.path("descriptionHtml").asText(""), MAX_DESCRIPTION);
            out.add(
                posting(
                    id,
                    title,
                    sourceCompany,
                    location,
                    workplace,
                    remote ? Boolean.TRUE : null,
                    j.path("employmentType").asText(null),
                    j.path("department").asText(null),
                    url,
                    j.path("applyUrl").asText(url),
                    published,
                    tidy(description)
                )
            );
        }
        return out;
    }

    /** OnSite / on-site / Remote / Hybrid … → ONSITE / REMOTE / HYBRID, or null. */
    static String workplace(String raw) {
        String w = raw == null ? "" : raw.toLowerCase(Locale.ROOT).replaceAll("[^a-z]", "");
        return switch (w) {
            case "remote" -> "REMOTE";
            case "hybrid" -> "HYBRID";
            case "onsite", "inoffice", "office" -> "ONSITE";
            default -> null;
        };
    }

    static boolean mentionsRemote(String location) {
        return location != null && location.toLowerCase(Locale.ROOT).contains("remote");
    }

    static Instant instant(String iso) {
        if (iso == null || iso.isBlank()) return null;
        try {
            return OffsetDateTime.parse(iso.trim()).toInstant();
        } catch (Exception e) {
            try {
                return Instant.parse(iso.trim());
            } catch (Exception e2) {
                return null;
            }
        }
    }

    private static String tidy(String text) {
        String t = text.replace(' ', ' ').replaceAll("[ \\t\\x0B\\f\\r]+", " ").replaceAll(" *\n *", "\n").replaceAll("\n{3,}", "\n\n").trim();
        return t.length() > MAX_DESCRIPTION ? t.substring(0, MAX_DESCRIPTION) : t;
    }

    private static FetchedPosting posting(
        String id,
        String title,
        String company,
        String location,
        String workplace,
        Boolean remote,
        String employment,
        String department,
        String url,
        String applyUrl,
        Instant published,
        String description
    ) {
        return new FetchedPosting(
            cut(id, 100),
            cut(title, 300),
            cut(company, 200),
            blankToNull(cut(location, 300)),
            workplace,
            remote,
            blankToNull(cut(employment, 40)),
            blankToNull(cut(department, 200)),
            cut(url, 1000),
            blankToNull(cut(applyUrl, 1000)),
            published,
            description
        );
    }

    private static String cut(String s, int n) {
        if (s == null) return null;
        String t = s.trim();
        return t.length() > n ? t.substring(0, n) : t;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
