package com.dossier.api.service.ent;

import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgSlugs;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Pure rules for {@code organization.subdomain}, the label in {@code {label}.kiwiply.com} (X1.2, 04-tenancy-and-security.md
 * section 2.2): 3 to 63 characters of {@code a-z 0-9 -}, starting and ending with a letter or digit, never containing
 * {@code --} (which also keeps every punycode {@code xn--} label out), and not one of the reserved platform labels
 * ({@link OrgSlugs#isReserved} plus {@link #RESERVED_LABELS}). A reserved label is a 422 {@code RESERVED_VALUE}, the same answer as a reserved slug.
 */
public final class OrgSubdomains {

    public static final int MIN = 3;
    public static final int MAX = 63;

    /**
     * Labels that must never be a tenant subdomain on top of the reserved slugs (X1.2, 04-tenancy-and-security.md section
     * 2.2): infrastructure and product hosts. Subdomain-only on purpose: these are fine as an organization SLUG, and a slug
     * rule that changes with the enterprise flag off would change today's behaviour.
     */
    static final Set<String> RESERVED_LABELS = Set.of("mail", "edge", "static", "cdn", "dev", "staging", "connect");

    private static final Pattern VALID = Pattern.compile("[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]");

    private OrgSubdomains() {}

    /** True when {@code label} is a well-formed label (it may still be reserved or taken). */
    public static boolean isWellFormed(String label) {
        return label != null && label.length() >= MIN && label.length() <= MAX && VALID.matcher(label).matches() && !label.contains("--");
    }

    public static boolean isReserved(String label) {
        return OrgSlugs.isReserved(label) || RESERVED_LABELS.contains(label);
    }

    /**
     * The canonical (lower-case) label, or a 422: {@code ORG_INVALID} when it is malformed, {@code RESERVED_VALUE} when it
     * is a reserved platform label.
     */
    public static String requireValid(String raw) {
        if (raw == null || raw.isBlank()) throw OrgException.invalid("subdomain", "is required");
        String label = raw.trim().toLowerCase(Locale.ROOT);
        if (!isWellFormed(label)) {
            throw OrgException.invalid("subdomain", "must be " + MIN + " to " + MAX + " letters, digits or single hyphens, starting and ending with a letter or digit");
        }
        if (isReserved(label)) throw OrgException.reserved("subdomain", label);
        return label;
    }
}
