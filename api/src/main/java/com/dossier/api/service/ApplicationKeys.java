package com.dossier.api.service;

import java.net.URI;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * When two captures are the same job (Phase 14.5, was 3.6.5). The extension saves a job wherever the
 * user meets it — LinkedIn, then the company's own Greenhouse page — and each board has its own job
 * id and link, so matching only on those gave one application per board, and the inbox (14.4) would
 * then update one and leave the other stale. This is the one definition of "same job", shared by the
 * board's upsert and the inbox's matching:
 *
 * <ul>
 *   <li><b>Company</b> — lower-cased, legal suffixes and a trailing ".com"/".io" dropped, spaces
 *       ignored: "Acme, Inc.", "ACME" and "Acme.com" are one company.</li>
 *   <li><b>Title</b> — lower-cased, anything in brackets dropped, "Sr."→"senior", "II"→"2",
 *       punctuation as spaces: "Sr. Backend Engineer II (Remote)" = "Senior Backend Engineer 2".</li>
 *   <li><b>Location</b>, fuzzily — two locations clash only when both name places and share no
 *       place word ("New York, NY" vs "San Francisco, CA"). Remote, blank or overlapping is fine, so
 *       the same title in two cities stays two applications.</li>
 *   <li><b>Links</b> — compared without tracking parameters, "www." or a trailing slash.</li>
 * </ul>
 */
public final class ApplicationKeys {

    private static final Pattern LEGAL = Pattern.compile(
        "\\b(inc|incorporated|llc|l l c|ltd|limited|corp|corporation|co|company|gmbh|plc|sa|ag|bv|pty|srl|the)\\b"
    );
    private static final Pattern BRACKETS = Pattern.compile("\\([^)]*\\)|\\[[^]]*]");
    /** Words that say how, not where: they never make two locations different. */
    private static final Set<String> NOT_PLACES = Set.of(
        "remote", "hybrid", "onsite", "on", "site", "office", "hq", "headquarters", "anywhere", "and", "or", "in", "the",
        "usa", "us", "united", "states", "america", "global", "worldwide", "only", "based", "flexible", "location", "locations",
        // Words many place names share: "New York" and "New Delhi" aren't the same place.
        "new", "san", "santa", "los", "las", "saint", "fort", "port", "north", "south", "east", "west", "city", "county", "area"
    );
    private static final Set<String> TRACKING = Set.of(
        "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gh_src", "source", "src", "ref", "referrer",
        "lever-source", "lever-origin", "trk", "trackingid", "refid", "from", "iis", "iisn"
    );

    private ApplicationKeys() {}

    /** A company as a comparison key; "" when there's nothing to compare. */
    public static String company(String name) {
        if (name == null) return "";
        String s = name.toLowerCase(Locale.ROOT).trim().replaceAll("\\.(com|io|ai|co|net|org|app)$", "");
        s = s.replace("&", " and ").replaceAll("[^\\p{L}\\p{N}]+", " ");
        s = LEGAL.matcher(s).replaceAll(" ");
        return s.replaceAll("\\s+", "");
    }

    /** A job title as a comparison key; "" when there's nothing to compare. */
    public static String title(String title) {
        if (title == null) return "";
        String s = BRACKETS.matcher(title.toLowerCase(Locale.ROOT)).replaceAll(" ");
        s = s.replace("&", " and ").replaceAll("[^\\p{L}\\p{N}+#]+", " ");
        StringBuilder out = new StringBuilder();
        for (String w : s.trim().split("\\s+")) {
            if (w.isEmpty()) continue;
            String v = switch (w) {
                case "sr" -> "senior";
                case "jr" -> "junior";
                case "ii" -> "2";
                case "iii" -> "3";
                case "iv" -> "4";
                case "i" -> "1";
                case "eng", "engr" -> "engineer";
                case "mgr" -> "manager";
                default -> w;
            };
            if (out.length() > 0) out.append(' ');
            out.append(v);
        }
        return out.toString();
    }

    /** False only when both name places and they share no place word. */
    public static boolean locationsCompatible(String a, String b) {
        Set<String> pa = places(a);
        Set<String> pb = places(b);
        if (pa.isEmpty() || pb.isEmpty()) return true;
        for (String w : pa) if (pb.contains(w)) return true;
        return false;
    }

    /** Company, title and location all say it's the same job (both company and title present). */
    public static boolean sameJob(String companyA, String titleA, String locationA, String companyB, String titleB, String locationB) {
        String ca = company(companyA), cb = company(companyB), ta = title(titleA), tb = title(titleB);
        return !ca.isEmpty() && !ta.isEmpty() && ca.equals(cb) && ta.equals(tb) && locationsCompatible(locationA, locationB);
    }

    /** A link without its tracking noise, for comparing; the input when it isn't a URL. */
    public static String url(String link) {
        if (link == null) return "";
        String raw = link.trim();
        try {
            URI u = URI.create(raw);
            if (u.getHost() == null) return raw;
            String host = u.getHost().toLowerCase(Locale.ROOT).replaceFirst("^www\\.", "");
            String path = u.getRawPath() == null ? "" : u.getRawPath().replaceAll("/+$", "");
            StringBuilder q = new StringBuilder();
            if (u.getRawQuery() != null) {
                for (String part : u.getRawQuery().split("&")) {
                    String key = part.split("=", 2)[0].toLowerCase(Locale.ROOT);
                    if (part.isEmpty() || TRACKING.contains(key) || key.startsWith("utm_")) continue;
                    q.append(q.length() == 0 ? "?" : "&").append(part);
                }
            }
            return host + path + q;
        } catch (IllegalArgumentException e) {
            return raw;
        }
    }

    private static Set<String> places(String location) {
        Set<String> out = new HashSet<>();
        if (location == null) return out;
        for (String w : location.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").trim().split("\\s+")) {
            if (w.length() >= 3 && !NOT_PLACES.contains(w)) out.add(w);
        }
        return out;
    }
}
