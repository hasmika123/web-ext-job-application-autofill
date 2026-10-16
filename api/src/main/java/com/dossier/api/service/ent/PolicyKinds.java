package com.dossier.api.service.ent;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * The policy kinds an organization can publish (docs/enterprise-v2/62). WHICH kinds exist is the admin setting
 * {@code enterprise.policies.kinds}; this class only gives a kind its title and its public path. The four default kinds have
 * fixed short paths; any other configured key is served at {@code /policies/{key-with-hyphens}}.
 */
public final class PolicyKinds {

    public static final String PRIVACY = "PRIVACY";
    public static final String TERMS = "TERMS";
    public static final String ACCEPTABLE_USE = "ACCEPTABLE_USE";
    public static final String SUPPORT_CONTACT = "SUPPORT_CONTACT";

    private static final Map<String, String> TITLES = Map.of(
        PRIVACY, "Privacy Policy",
        TERMS, "Terms of Use",
        ACCEPTABLE_USE, "Acceptable Use Policy",
        SUPPORT_CONTACT, "Support and contact",
        "COOKIES", "Cookie Policy",
        "SECURITY", "Security"
    );

    private static final Map<String, String> PATHS = Map.of(
        PRIVACY, "/privacy",
        TERMS, "/terms",
        ACCEPTABLE_USE, "/acceptable-use",
        SUPPORT_CONTACT, "/support"
    );

    /** A kind as the API shows it. */
    public record Meta(String kind, String title, String path) {}

    private PolicyKinds() {}

    public static Meta meta(String kind) {
        return new Meta(kind, title(kind), path(kind));
    }

    public static String title(String kind) {
        String known = TITLES.get(kind);
        if (known != null) return known;
        StringBuilder out = new StringBuilder();
        for (String w : kind.toLowerCase(Locale.ROOT).split("_")) {
            if (w.isEmpty()) continue;
            if (out.length() > 0) out.append(' ');
            out.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
        }
        return out.toString();
    }

    public static String path(String kind) {
        String fixed = PATHS.get(kind);
        return fixed != null ? fixed : "/policies/" + kind.toLowerCase(Locale.ROOT).replace('_', '-');
    }

    /**
     * Read a caller's kind text ({@code PRIVACY}, {@code privacy}, {@code acceptable-use}, {@code support}) against the configured
     * kinds. Empty when it is not one of them (the caller answers the generic 404).
     */
    public static Optional<String> resolve(String raw, List<String> configured) {
        if (raw == null || raw.isBlank() || raw.length() > 40) return Optional.empty();
        String k = raw.strip().toUpperCase(Locale.ROOT).replace('-', '_');
        if ("SUPPORT".equals(k)) k = SUPPORT_CONTACT;
        return configured.contains(k) ? Optional.of(k) : Optional.empty();
    }
}
