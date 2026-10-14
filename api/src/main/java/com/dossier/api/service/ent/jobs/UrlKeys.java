package com.dossier.api.service.ent.jobs;

import com.dossier.api.service.ApplicationKeys;
import com.dossier.api.service.org.OrgException;
import java.net.IDN;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The identity of a job posting (docs/enterprise-v2/60-job-phase1-contract.md section 2): {@code url_key} is built here in Java (not a generated
 * column) and the unique key is on its SHA-256, {@code url_key_hash}.
 *
 * <p>{@link #normalize} must give the SAME key as the extension's {@code JAF.workspace.urlKey} (job-autofill/src/lib/workspace.js) for every case of the
 * shared golden file ({@code url-keys.json}, run by both test suites). The rules: lower-cased scheme and host ({@code www.} dropped, an international
 * host as its {@code xn--} form), a NON-DEFAULT port kept ({@code :8443}; {@code :443} on https and {@code :80} on http are the default and dropped),
 * no user-info, no fragment, dot segments resolved, trailing slashes dropped, tracking parameters dropped (the {@link ApplicationKeys} list), query
 * order and path case kept, capped at {@value #MAX_KEY} characters. The path and the query are percent-encoded the way a browser's URL parser does
 * (a space is {@code %20}, a non-ASCII letter becomes its UTF-8 bytes, e.g. {@code Se%C3%B1or}) PLUS the characters that parser leaves raw in some
 * versions: the double quote, {@code < > ` ^ |}, the curly braces and the backslash are always encoded. Existing {@code %XX} sequences are never
 * touched. The URL is parsed by hand (never {@code java.net.URI}, which throws on the pipe, caret and curly braces and so would reject a link the
 * browser accepted).
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
        Parts p = parse(raw);
        if (p == null || p.scheme() == null || (!p.scheme().equals("https") && !p.scheme().equals("http")) || p.host() == null || p.host().isEmpty()) return null;
        String scheme = p.scheme();
        String host = p.host();
        String path = removeDotSegments(p.path());

        String ext = externalJobId == null ? "" : externalJobId.trim();
        boolean linkedin = LINKEDIN_HOST.matcher(host).find();
        StringBuilder query = new StringBuilder();
        boolean usedCurrentJobId = false;
        if (p.query() != null) {
            for (String part : p.query().split("&")) {
                Matcher m = CURRENT_JOB_ID.matcher(part);
                if (m.matches() && !ext.isEmpty() && m.group(1).equals(ext)) {
                    usedCurrentJobId = true;
                    continue; // identifies the job, not the page: handled below
                }
                if (part.isEmpty() || ApplicationKeys.isTrackingParam(part.split("=", 2)[0])) continue;
                query.append(query.length() == 0 ? "?" : "&").append(encode(part));
            }
        }
        if (linkedin && !ext.isEmpty()) {
            Matcher view = LINKEDIN_VIEW.matcher(path);
            if (usedCurrentJobId || (view.matches() && view.group(1).equals(ext))) {
                // collection / search / posting pages of one LinkedIn job share one key
                return cap(scheme + "://" + stripWww(host) + "/jobs/view/" + ext);
            }
        }
        String port = p.port() < 0 || p.port() == defaultPort(scheme) ? "" : ":" + p.port();
        return cap(scheme + "://" + stripWww(host) + port + encode(path.replaceAll("/+$", "")) + query);
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
        Parts u = parse(url);
        if (u == null) return "that is not a valid link";
        if (u.scheme() == null || !u.scheme().equals("https")) return "the link must start with https://";
        if (u.userInfo() != null) return "the link must not contain a user name or password";
        if (u.port() != -1 && u.port() != 443) return "the link must use the standard https port";
        String host = u.host();
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

    // ---- parsing and encoding (no java.net.URI: it throws on characters a browser accepts) -------------------------------------

    private static final Pattern SCHEME = Pattern.compile("^([A-Za-z][A-Za-z0-9+.\\-]*):(.*)$", Pattern.DOTALL);
    private static final char[] HEX = "0123456789ABCDEF".toCharArray();

    /** A link taken apart; {@code scheme} is null when there is none, {@code host} null when there is no authority. */
    record Parts(String scheme, String userInfo, String host, int port, String path, String query) {}

    /** Null = malformed (a bad port or bracket, a space or control character in the host); otherwise the pieces, lower-casing scheme and host. */
    static Parts parse(String raw) {
        int hash = raw.indexOf('#');
        if (hash >= 0) raw = raw.substring(0, hash);
        Matcher m = SCHEME.matcher(raw);
        if (!m.matches()) return new Parts(null, null, null, -1, "", null);
        String scheme = m.group(1).toLowerCase(Locale.ROOT);
        String rest = m.group(2);
        if (!rest.startsWith("//")) return new Parts(scheme, null, null, -1, "", null);
        rest = rest.substring(2);
        int q = rest.indexOf('?');
        String beforeQuery = (q >= 0 ? rest.substring(0, q) : rest).replace('\\', '/');
        String query = q >= 0 ? rest.substring(q + 1) : null;
        int slash = beforeQuery.indexOf('/');
        String authority = slash >= 0 ? beforeQuery.substring(0, slash) : beforeQuery;
        String path = slash >= 0 ? beforeQuery.substring(slash) : "";

        String userInfo = null;
        String hostPort = authority;
        int at = authority.lastIndexOf('@');
        if (at >= 0) {
            userInfo = authority.substring(0, at);
            hostPort = authority.substring(at + 1);
        }
        String host;
        int port = -1;
        if (hostPort.startsWith("[")) {
            int end = hostPort.indexOf(']');
            if (end < 0) return null;
            host = hostPort.substring(0, end + 1);
            String after = hostPort.substring(end + 1);
            if (!after.isEmpty()) {
                if (!after.startsWith(":")) return null;
                port = port(after.substring(1));
                if (port == -2) return null;
            }
        } else {
            int colon = hostPort.lastIndexOf(':');
            if (colon >= 0) {
                host = hostPort.substring(0, colon);
                port = port(hostPort.substring(colon + 1));
                if (port == -2) return null;
            } else {
                host = hostPort;
            }
        }
        host = host.toLowerCase(Locale.ROOT);
        if (host.chars().anyMatch(c -> c <= 0x20 || c == 0x7f)) return null;
        if (host.chars().anyMatch(c -> c > 0x7f)) {
            try {
                host = IDN.toASCII(host);
            } catch (IllegalArgumentException e) {
                return null;
            }
        }
        return new Parts(scheme, userInfo, host, port, path, query);
    }

    /** -1 = no port, -2 = not a port, otherwise 0..65535. */
    private static int port(String digits) {
        if (digits.isEmpty()) return -1;
        if (digits.length() > 5 || !digits.chars().allMatch(c -> c >= '0' && c <= '9')) return -2;
        int n = Integer.parseInt(digits);
        return n > 65535 ? -2 : n;
    }

    private static int defaultPort(String scheme) {
        return scheme.equals("https") ? 443 : 80;
    }

    /** "." and ".." segments resolved the way a browser does (also their %2e forms); empty segments are kept. */
    static String removeDotSegments(String path) {
        if (path == null || path.isEmpty()) return "";
        String[] segments = path.substring(path.startsWith("/") ? 1 : 0).split("/", -1);
        List<String> out = new ArrayList<>();
        for (String seg : segments) {
            String s = seg.toLowerCase(Locale.ROOT);
            boolean single = s.equals(".") || s.equals("%2e");
            boolean twice = s.equals("..") || s.equals(".%2e") || s.equals("%2e.") || s.equals("%2e%2e");
            if (twice) {
                if (!out.isEmpty()) out.remove(out.size() - 1);
            } else if (!single) {
                out.add(seg);
            }
        }
        return "/" + String.join("/", out);
    }

    /** Percent-encodes (UTF-8, upper-case hex) controls, space, DEL, every non-ASCII character and {@code " < > ` ^ | { } \}; an existing {@code %XX} is left alone. */
    static String encode(String s) {
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i);
            i += Character.charCount(cp);
            boolean raw = cp > 0x20 && cp < 0x7f && "\"<>`^|{}\\".indexOf(cp) < 0;
            if (raw) {
                b.append((char) cp);
                continue;
            }
            for (byte x : new String(Character.toChars(cp)).getBytes(StandardCharsets.UTF_8)) b.append('%').append(HEX[(x >> 4) & 15]).append(HEX[x & 15]);
        }
        return b.toString();
    }

    private static String stripWww(String host) {
        return host.replaceFirst("^www\\.", "");
    }

    private static String cap(String key) {
        return key.length() <= MAX_KEY ? key : key.substring(0, MAX_KEY);
    }
}
