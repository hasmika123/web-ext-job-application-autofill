package com.dossier.api.service.ent.jobs;

import com.dossier.api.service.ApplicationKeys;
import com.dossier.api.service.org.OrgException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The identity of a job posting (docs/enterprise-v2/60-job-phase1-contract.md section 2): {@code url_key} is built here in Java (not a generated
 * column) and the unique key is on its SHA-256, {@code url_key_hash}.
 *
 * <p>{@link #normalize} = the {@link ApplicationKeys#url} rules (no tracking parameters, no {@code www.}, no trailing slash, host lower-cased)
 * plus a lower-cased scheme, no fragment, no user-info and no port, capped at {@value #MAX_KEY} characters. Query order and path case are kept.
 *
 * <p>{@code currentJobId} (LinkedIn collection and search pages show the open job in it): when it was used as the job's {@code externalJobId}
 * the key must name THAT job, not the list page, otherwise every job opened from one list would collide on one key. For LinkedIn the key becomes the
 * canonical {@code /jobs/view/<id>} (so a collection link, a search link and the posting itself are one job); for any other host the parameter is
 * dropped, as the contract says. A {@code currentJobId} that was not used as the external id stays in the key.
 *
 * <p>{@link #requireAllowed} is the gate for a URL a client sends: https only, a real DNS name (never an IP literal, {@code localhost} or an
 * internal name), at most {@value #MAX_URL} characters. The server never fetches the URL in Phase 1; the check keeps hostile or useless values out.
 */
public final class UrlKeys {

    public static final int MAX_URL = 1000;
    public static final int MAX_KEY = 1000;

    private static final Pattern LINKEDIN_HOST = Pattern.compile("(^|\\.)linkedin\\.com$");
    private static final Pattern LINKEDIN_VIEW = Pattern.compile("^/jobs/view/(?:[^/]*-)?(\\d{5,})/?$");
    private static final Pattern CURRENT_JOB_ID = Pattern.compile("^currentJobId=(.*)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern IPV4_LIKE = Pattern.compile("^[0-9.]+$");
    private static final Pattern DNS_LABEL = Pattern.compile("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$");

    private UrlKeys() {}

    /** {@link #normalize(String, String)} with no external id: {@code currentJobId} stays in the key. */
    public static String normalize(String url) {
        return normalize(url, null);
    }

    /**
     * The normalized key of {@code url}; null when it is not an absolute http(s) URL with a host.
     *
     * @param externalJobId the id the caller extracted for this job, if any; a {@code currentJobId} equal to it is dropped (see the class comment)
     */
    public static String normalize(String url, String externalJobId) {
        if (url == null) return null;
        String raw = url.trim();
        int hash = raw.indexOf('#');
        if (hash >= 0) raw = raw.substring(0, hash);
        if (raw.isEmpty()) return null;
        URI u;
        try {
            u = URI.create(raw);
        } catch (IllegalArgumentException e) {
            return null;
        }
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        if ((!scheme.equals("https") && !scheme.equals("http")) || u.getHost() == null) return null;
        String host = u.getHost().toLowerCase(Locale.ROOT);
        String path = u.getRawPath() == null ? "" : u.getRawPath();

        String ext = externalJobId == null ? "" : externalJobId.trim();
        boolean linkedin = LINKEDIN_HOST.matcher(host).find();
        StringBuilder query = new StringBuilder();
        boolean usedCurrentJobId = false;
        if (u.getRawQuery() != null) {
            for (String part : u.getRawQuery().split("&")) {
                Matcher m = CURRENT_JOB_ID.matcher(part);
                if (m.matches() && !ext.isEmpty() && m.group(1).equals(ext)) {
                    usedCurrentJobId = true;
                    continue; // identifies the job, not the page: handled below
                }
                if (part.isEmpty()) continue;
                query.append(query.length() == 0 ? "?" : "&").append(part);
            }
        }
        if (linkedin && !ext.isEmpty()) {
            Matcher view = LINKEDIN_VIEW.matcher(path);
            if (usedCurrentJobId || (view.matches() && view.group(1).equals(ext))) {
                // collection / search / posting pages of one LinkedIn job share one key
                return cap(scheme + "://" + stripWww(host) + "/jobs/view/" + ext);
            }
        }
        String tail = ApplicationKeys.url(scheme + "://" + host + path + query);
        return cap(tail.startsWith(scheme + "://") ? tail : scheme + "://" + tail);
    }

    /** Lower-case hex SHA-256 of the key; null in, null out. */
    public static String hash(String normalizedKey) {
        if (normalizedKey == null) return null;
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(normalizedKey.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** {@code hash(normalize(url, externalJobId))}. */
    public static String keyHash(String url, String externalJobId) {
        return hash(normalize(url, externalJobId));
    }

    /** The key and its hash in one go. */
    public record Key(String key, String hash) {}

    public static Key of(String url, String externalJobId) {
        String key = normalize(url, externalJobId);
        return key == null ? null : new Key(key, hash(key));
    }

    /** True when {@code url} may be stored as a job link: see {@link #requireAllowed}. */
    public static boolean isAllowed(String url) {
        return reason(url) == null;
    }

    /** Throws 400 {@code VALIDATION} when {@code url} may not be stored as a job link. */
    public static void requireAllowed(String url) {
        String why = reason(url);
        if (why != null) throw OrgException.coded(400, "VALIDATION", "jobUrl: " + why, Map.of("field", "jobUrl"));
    }

    /** Null when allowed, otherwise a short human reason. */
    static String reason(String url) {
        if (url == null || url.isBlank()) return "enter the link of the job posting";
        if (url.length() > MAX_URL) return "the link is at most " + MAX_URL + " characters";
        if (url.chars().anyMatch(c -> c <= 0x20 || c == 0x7f)) return "the link has spaces or control characters";
        URI u;
        try {
            u = URI.create(url);
        } catch (IllegalArgumentException e) {
            return "that is not a valid link";
        }
        if (u.getScheme() == null || !u.getScheme().equalsIgnoreCase("https")) return "the link must start with https://";
        if (u.getRawUserInfo() != null) return "the link must not contain a user name or password";
        if (u.getPort() != -1 && u.getPort() != 443) return "the link must use the standard https port";
        String host = u.getHost();
        if (host == null || host.isEmpty()) return "that is not a valid link";
        host = host.toLowerCase(Locale.ROOT);
        if (host.endsWith(".")) host = host.substring(0, host.length() - 1);
        if (host.startsWith("[") || host.contains(":")) return "the link must use a website name, not an address";
        if (host.equals("localhost") || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")
            || host.endsWith(".home") || host.endsWith(".corp") || host.endsWith(".test") || host.endsWith(".invalid") || host.endsWith(".example")) {
            return "that website cannot be a job posting";
        }
        if (IPV4_LIKE.matcher(host).matches()) return "the link must use a website name, not an address";
        String[] labels = host.split("\\.", -1);
        if (labels.length < 2) return "that website cannot be a job posting";
        for (String label : labels) {
            if (!DNS_LABEL.matcher(label).matches()) return "that is not a valid website name";
        }
        String tld = labels[labels.length - 1];
        if (tld.length() < 2 || tld.chars().allMatch(Character::isDigit) || tld.startsWith("0x")) return "the link must use a website name, not an address";
        return null;
    }

    private static String stripWww(String host) {
        return host.replaceFirst("^www\\.", "");
    }

    private static String cap(String key) {
        return key.length() <= MAX_KEY ? key : key.substring(0, MAX_KEY);
    }
}
