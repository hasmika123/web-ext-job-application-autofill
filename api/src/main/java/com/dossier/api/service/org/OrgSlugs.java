package com.dossier.api.service.org;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * Pure slug rules for {@code organization.slug} (tenant-model.md section 2.1): URL-safe, 3 to 60 characters, used in
 * invite links {@code kiwiply.com/join/{slug}/{code}}. A reserved word is treated exactly like a taken slug so the
 * caller gets a suggestion instead of a dead end.
 */
public final class OrgSlugs {

    public static final int MIN = 3;
    public static final int MAX = 60;

    private static final Pattern VALID = Pattern.compile("^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$");
    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");

    /** Words that would read as part of the product's own routes or brand. */
    static final Set<String> RESERVED = Set.of(
        "admin", "api", "app", "www", "join", "new", "mine", "org", "orgs", "organization", "organizations", "kiwiply", "support", "help",
        "login", "signup", "register", "dashboard", "settings", "billing", "status", "blog", "docs", "careers", "pricing", "demo",
        "demo-bootcamp", // the slug of the seeded demo organization (DemoOrgSeeder)
        // Enterprise V2 (X1.2, 04-tenancy-and-security.md section 2.2): labels that must never be a tenant subdomain
        "mail", "edge", "static", "cdn", "dev", "staging", "connect"
    );

    private OrgSlugs() {}

    /** A slug from a display name: accents folded, lower-cased, runs of other characters become one dash. */
    public static String derive(String name) {
        String folded = Normalizer.normalize(name == null ? "" : name, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        String s = NON_ALNUM.matcher(folded.toLowerCase(Locale.ROOT)).replaceAll("-");
        s = trimDashes(s);
        if (s.length() > MAX) s = trimDashes(s.substring(0, MAX));
        if (s.isEmpty()) return "org-team";
        if (s.length() < MIN) s = s + "-org";
        return s;
    }

    /** True when {@code slug} is well-formed (it may still be reserved or taken). */
    public static boolean isWellFormed(String slug) {
        return slug != null && slug.length() >= MIN && slug.length() <= MAX && VALID.matcher(slug).matches() && !slug.contains("--");
    }

    public static boolean isReserved(String slug) {
        return RESERVED.contains(slug);
    }

    /** The first of {@code base}, {@code base-2}, {@code base-3} ... that is neither reserved nor {@code taken}. */
    public static String suggest(String base, Predicate<String> taken) {
        if (!isReserved(base) && !taken.test(base)) return base;
        for (int n = 2; n < 1000; n++) {
            String suffix = "-" + n;
            String head = base.length() + suffix.length() > MAX ? trimDashes(base.substring(0, MAX - suffix.length())) : base;
            String candidate = head + suffix;
            if (!isReserved(candidate) && !taken.test(candidate)) return candidate;
        }
        return base + "-" + System.nanoTime() % 100000; // practically unreachable
    }

    private static String trimDashes(String s) {
        int a = 0;
        int b = s.length();
        while (a < b && s.charAt(a) == '-') a++;
        while (b > a && s.charAt(b - 1) == '-') b--;
        return s.substring(a, b);
    }
}
