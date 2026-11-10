package com.dossier.api.service.jobs;

import java.util.List;
import java.util.Locale;

/**
 * The employment types job search offers, and how a board's own words ("Full-time", "FullTime", "Permanent",
 * "Freelance") fall into them. The SQL filter in {@code JobPostingSearchRepository} implements the same rules
 * over the stored text; this is the Java side (result cards and the type facet).
 */
public final class JobTypes {

    /** The filter's values, in the order the UI lists them. */
    public static final List<String> ALL = List.of("FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP");

    private JobTypes() {}

    /** One of {@link #ALL}, or null when the board's text says none of them (or nothing). */
    public static String normalize(String employmentType) {
        String e = employmentType == null ? "" : employmentType.toLowerCase(Locale.ROOT).replaceAll("[^a-z]", "");
        if (e.startsWith("fulltime") || e.equals("permanent")) return "FULL_TIME";
        if (e.startsWith("parttime")) return "PART_TIME";
        if (e.startsWith("contract") || e.startsWith("freelance")) return "CONTRACT";
        if (e.startsWith("intern")) return "INTERNSHIP";
        return null;
    }
}
