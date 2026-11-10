package com.dossier.api.service.dto;

import com.dossier.api.service.ResumeDocException;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/**
 * The one list contract (APP-E2E-PLAN section 2.4): {@code ?page=0&size=20&sort=<field>,<asc|desc>&q=<text>}.
 *
 * <p>Every list endpoint parses its query string through {@link #parse}, so paging, sorting and search
 * behave the same everywhere: {@code size} is clamped to {@code [1, maxSize]}, {@code page} to {@code >= 0},
 * {@code sort} is checked against the endpoint's whitelist (anything else is a 400
 * {@code SORT_INVALID}, never an arbitrary column name reaching the database), and {@code q} is trimmed
 * and refused over {@code maxQueryLength} (400 {@code QUERY_TOO_LONG}). Filters are the endpoint's own
 * named parameters and are not parsed here. The limits are parameters ({@link Limits}) so an endpoint can
 * read them from the settings seam; the defaults below are the plan's.
 *
 * @param page zero-based page number
 * @param size page size, already clamped
 * @param sortField the whitelisted sort field (the whitelist's own spelling)
 * @param direction the sort direction
 * @param q the trimmed search text, or {@code null} when there is none
 */
public record ListQuery(int page, int size, String sortField, Sort.Direction direction, String q) {
    /** Error code of a sort the endpoint does not allow. */
    public static final String CODE_SORT_INVALID = "SORT_INVALID";
    /** Error code of a search text over the limit. */
    public static final String CODE_QUERY_TOO_LONG = "QUERY_TOO_LONG";

    public static final int DEFAULT_SIZE = 20;
    public static final int DEFAULT_MAX_SIZE = 50;
    public static final int DEFAULT_MAX_QUERY_LENGTH = 120;

    /** The tunables of the contract; an endpoint may pass values read from the settings seam. */
    public record Limits(int defaultSize, int maxSize, int maxQueryLength) {
        public static final Limits DEFAULTS = new Limits(DEFAULT_SIZE, DEFAULT_MAX_SIZE, DEFAULT_MAX_QUERY_LENGTH);
    }

    /** Parse with the default limits; with no {@code sort} the first entry of {@code allowedSorts} is used, ascending. */
    public static ListQuery parse(Integer page, Integer size, String sort, String q, Collection<String> allowedSorts) {
        return parse(page, size, sort, q, allowedSorts, null, Limits.DEFAULTS);
    }

    /**
     * @param allowedSorts the fields {@code sort} may name (matched case-insensitively, the whitelist's spelling is kept)
     * @param defaultSort {@code field,dir} used when {@code sort} is absent; {@code null} means the first allowed field, ascending
     */
    public static ListQuery parse(
        Integer page,
        Integer size,
        String sort,
        String q,
        Collection<String> allowedSorts,
        String defaultSort,
        Limits limits
    ) {
        int pageNo = page == null ? 0 : Math.max(0, page);
        int pageSize = size == null ? limits.defaultSize() : Math.min(limits.maxSize(), Math.max(1, size));

        String text = q == null ? null : q.trim();
        if (text != null && text.isEmpty()) text = null;
        if (text != null && text.length() > limits.maxQueryLength()) {
            throw new ResumeDocException(
                400,
                CODE_QUERY_TOO_LONG,
                "Search text is limited to " + limits.maxQueryLength() + " characters",
                Map.of("max", limits.maxQueryLength())
            );
        }

        String[] chosen = sortParts(sort != null && !sort.isBlank() ? sort : defaultSort, allowedSorts);
        return new ListQuery(pageNo, pageSize, chosen[0], Sort.Direction.fromString(chosen[1]), text);
    }

    private static String[] sortParts(String raw, Collection<String> allowed) {
        if (raw == null || raw.isBlank()) {
            return new String[] { allowed.iterator().next(), "asc" };
        }
        String[] bits = raw.split(",", -1);
        String field = bits[0].trim();
        String dir = bits.length > 1 ? bits[1].trim().toLowerCase(Locale.ROOT) : "asc";
        String match = allowed.stream().filter(a -> a.equalsIgnoreCase(field)).findFirst().orElse(null);
        boolean dirOk = dir.equals("asc") || dir.equals("desc");
        if (bits.length > 2 || match == null || !dirOk) {
            throw new ResumeDocException(
                400,
                CODE_SORT_INVALID,
                "Sort must be one of " + String.join(", ", allowed) + ", optionally followed by ,asc or ,desc",
                Map.of("allowed", List.copyOf(allowed))
            );
        }
        return new String[] { match, dir };
    }

    /** The Spring Data page request for this query (sorted by the whitelisted field). */
    public Pageable toPageable() {
        return PageRequest.of(page, size, Sort.by(direction, sortField));
    }

    public long offset() {
        return (long) page * size;
    }
}
