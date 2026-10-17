package com.dossier.api.service.resume;

import java.util.List;

/**
 * What a resume template can show (Resume Builder DESIGN 6.2) - the Java twin of the TypeScript
 * {@code TemplateCapabilities} in {@code packages/ui/src/resume/types.ts}. The renderer and the editor
 * live in the web; the API only needs the two reference profiles and the strictness order (the
 * {@code resume.templates.overrides} setting is shaped by them, and a template cannot enable more than
 * {@link #DESIGN_FREE}). The three profiles are compared with {@code capabilities.json}, a fixture shared
 * byte-for-byte with the TypeScript tests, so the two languages cannot drift.
 *
 * <p>Property names match the TypeScript field names, so the record serialises to the same JSON.
 */
public record TemplateCapabilities(
    boolean ats,
    int columns,
    List<String> sidebarSections,
    boolean photo,
    boolean photoDefault,
    List<String> marks,
    boolean lists,
    boolean graphics,
    Theme theme,
    int maxPages,
    List<String> sections,
    String custom,
    int customLimit,
    String headings,
    List<String> dateStyles,
    int maxSkillGroups
) {
    /** The Customize Template controls a template enables. */
    public record Theme(boolean accent, List<String> fontPairs, boolean spacing, boolean pageLength) {}

    /** The profile an ATS-friendly template declares (it may only tighten). */
    public static final TemplateCapabilities ATS_STRICT = new TemplateCapabilities(
        true,
        1,
        List.of(),
        false,
        false,
        List.of("b"),
        false,
        false,
        new Theme(false, List.of("inter", "source-serif", "georgia-arial", "plex", "garamond"), true, true),
        2,
        List.of("SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "PROJECTS", "CERTIFICATIONS", "LANGUAGES", "ACHIEVEMENTS"),
        "limited",
        1,
        "standard",
        List.of("range"),
        6
    );

    /** The loosest profile a non-ATS template may declare. */
    public static final TemplateCapabilities DESIGN_FREE = new TemplateCapabilities(
        false,
        2,
        List.of("SKILLS", "LANGUAGES", "CERTIFICATIONS", "INTERESTS"),
        true,
        false,
        List.of("b", "i", "u", "a"),
        true,
        true,
        new Theme(true, List.of("inter", "source-serif", "georgia-arial", "plex", "garamond"), true, true),
        2,
        List.of("SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "PROJECTS", "CERTIFICATIONS", "LANGUAGES", "ACHIEVEMENTS", "INTERESTS", "CUSTOM"),
        "any",
        99,
        "free",
        List.of("range", "year"),
        0
    );

    /**
     * The middle profile for a single-column coloured template: {@link #DESIGN_FREE} without the second
     * column, the photo and graphics. A convenience constant (the registry rule is unchanged).
     */
    public static final TemplateCapabilities HYBRID = new TemplateCapabilities(
        false,
        1,
        List.of(),
        false,
        false,
        List.of("b", "i", "u", "a"),
        true,
        false,
        new Theme(true, List.of("inter", "source-serif", "georgia-arial", "plex", "garamond"), true, true),
        2,
        List.of("SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "PROJECTS", "CERTIFICATIONS", "LANGUAGES", "ACHIEVEMENTS", "INTERESTS", "CUSTOM"),
        "any",
        99,
        "free",
        List.of("range", "year"),
        0
    );

    /**
     * {@code this} is at least as strict as {@code other}: every boolean is {@code <=}, every list a
     * subset, every number {@code <=} ({@code maxSkillGroups} 0 = unlimited = loosest), and the
     * headings / custom modes no looser. {@code ats == true} counts as stricter than {@code false}.
     * An {@code ats: true} template must satisfy {@code isAtLeastAsStrictAs(ATS_STRICT)}, any other
     * {@code isAtLeastAsStrictAs(DESIGN_FREE)}.
     */
    public boolean isAtLeastAsStrictAs(TemplateCapabilities other) {
        if (!ats && other.ats) return false;
        if (columns > other.columns) return false;
        if (!other.sidebarSections.containsAll(sidebarSections)) return false;
        if (photo && !other.photo) return false;
        if (photoDefault && !other.photoDefault) return false;
        if (!other.marks.containsAll(marks)) return false;
        if (lists && !other.lists) return false;
        if (graphics && !other.graphics) return false;
        if (theme.accent && !other.theme.accent) return false;
        if (!other.theme.fontPairs.containsAll(theme.fontPairs)) return false;
        if (theme.spacing && !other.theme.spacing) return false;
        if (theme.pageLength && !other.theme.pageLength) return false;
        if (maxPages > other.maxPages) return false;
        if (!other.sections.containsAll(sections)) return false;
        if (customRank(custom) > customRank(other.custom)) return false;
        if ("limited".equals(custom) && "limited".equals(other.custom) && customLimit > other.customLimit) return false;
        if (headingsRank(headings) > headingsRank(other.headings)) return false;
        if (!other.dateStyles.containsAll(dateStyles)) return false;
        return groupsCap(maxSkillGroups) <= groupsCap(other.maxSkillGroups);
    }

    private static int customRank(String mode) {
        return switch (mode) {
            case "none" -> 0;
            case "limited" -> 1;
            default -> 2;
        };
    }

    private static int headingsRank(String mode) {
        return "standard".equals(mode) ? 0 : 1;
    }

    private static int groupsCap(int n) {
        return n > 0 ? n : Integer.MAX_VALUE;
    }
}
