package com.dossier.api.service.jobs;

import java.util.Locale;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * The text a posting is searched by (E2E-U4.0): title, company, location and the first
 * {@link #DESCRIPTION_CHARS} characters of the description, lower-cased and on one line. The FULLTEXT
 * index covers it, and the short-word fallback ({@code LIKE}) reads it too.
 */
public final class JobSearchText {

    /** Same as the backfill in the changelog ({@code LEFT(description_text, 4000)}). */
    public static final int DESCRIPTION_CHARS = 4000; // config-literal-ok: matches the migration's backfill, not a tunable

    private JobSearchText() {}

    public static String of(String title, String company, String location, String description) {
        String d = description == null ? null : description.length() <= DESCRIPTION_CHARS ? description : description.substring(0, DESCRIPTION_CHARS);
        return Stream.of(title, company, location, d)
            .filter(s -> s != null && !s.isBlank())
            .map(s -> s.replaceAll("\\s+", " ").trim())
            .collect(Collectors.joining(" "))
            .toLowerCase(Locale.ROOT);
    }
}
