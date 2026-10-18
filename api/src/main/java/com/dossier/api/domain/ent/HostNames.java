package com.dossier.api.domain.ent;

import java.net.IDN;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The one way a hostname is written down (ADR-003, 04-tenancy-and-security.md section 1): lower-cased, punycoded, no port,
 * no trailing dot. Pure, so the entity that stores a hostname ({@link OrgHostname}), the tenant resolver and the
 * certificate-check endpoint all agree on what "the same host" means. A value that is not a plain DNS name or an IP literal
 * (a list of hosts, a path, a userinfo, whitespace, an underscore) is rejected rather than repaired: {@link #normalise}
 * returns {@code null}, and callers treat that as an unknown host.
 */
public final class HostNames {

    /** DNS limit for a whole name. */
    public static final int MAX_LENGTH = 253;

    private static final Pattern LABEL = Pattern.compile("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?");
    private static final Pattern IPV4 = Pattern.compile("(?:\\d{1,3}\\.){3}\\d{1,3}");
    private static final Pattern IPV6_BRACKETED = Pattern.compile("\\[[0-9a-f:.]{2,45}]");
    private static final Pattern PORT = Pattern.compile(":\\d{1,5}");

    private HostNames() {}

    /**
     * The canonical form of {@code raw}, or {@code null} when it is not a single valid hostname. Accepts the {@code Host}
     * header form {@code Name.Example:8443} and a bracketed IPv6 literal ({@code [::1]:3000}, returned as {@code [::1]}).
     */
    public static String normalise(String raw) {
        if (raw == null) return null;
        String h = raw.trim().toLowerCase(Locale.ROOT);
        if (h.isEmpty() || h.length() > MAX_LENGTH + 6) return null;
        if (h.startsWith("[")) { // IPv6 literal, optionally followed by :port
            int close = h.indexOf(']');
            if (close < 0) return null;
            String literal = h.substring(0, close + 1);
            String rest = h.substring(close + 1);
            if (!rest.isEmpty() && !PORT.matcher(rest).matches()) return null;
            return IPV6_BRACKETED.matcher(literal).matches() ? literal : null;
        }
        int colon = h.lastIndexOf(':');
        if (colon >= 0) {
            if (!PORT.matcher(h.substring(colon)).matches()) return null;
            h = h.substring(0, colon);
        }
        if (h.endsWith(".")) h = h.substring(0, h.length() - 1);
        if (h.isEmpty()) return null;
        String ascii;
        try {
            ascii = IDN.toASCII(h, IDN.USE_STD3_ASCII_RULES);
        } catch (IllegalArgumentException e) {
            return null;
        }
        ascii = ascii.toLowerCase(Locale.ROOT);
        if (ascii.length() > MAX_LENGTH) return null;
        for (String label : ascii.split("\\.", -1)) {
            if (!LABEL.matcher(label).matches()) return null;
        }
        return ascii;
    }

    /** True when {@code host} is already in canonical form (what the database stores). */
    public static boolean isCanonical(String host) {
        return host != null && host.equals(normalise(host));
    }

    /** True for an IPv4 or IPv6 literal: a tenant is never an IP address. */
    public static boolean isIpLiteral(String canonicalHost) {
        return canonicalHost != null && (canonicalHost.startsWith("[") || IPV4.matcher(canonicalHost).matches());
    }

    /** True for {@code localhost} and the loopback literals: the host of a developer's own machine. */
    public static boolean isLoopback(String canonicalHost) {
        return "localhost".equals(canonicalHost) || "127.0.0.1".equals(canonicalHost) || "[::1]".equals(canonicalHost);
    }
}
