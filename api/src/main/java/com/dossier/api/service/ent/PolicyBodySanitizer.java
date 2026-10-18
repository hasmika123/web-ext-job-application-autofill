package com.dossier.api.service.ent;

import com.dossier.api.service.org.OrgException;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Server-side sanitizing of a policy body (docs/enterprise-v2/62 section 1, decision 3). The body is a small Markdown subset
 * (headings, paragraphs, lists, bold, italic, links) that the web renders to React elements. Rather than try to repair
 * markup, anything that could run or fetch something is REFUSED with {@code 422 POLICY_BODY_INVALID}: raw HTML or tags, images
 * (so no remote image can be loaded), reference-style link definitions, and link targets other than {@code https:},
 * {@code mailto:}, a same-host path or an in-page anchor. Control characters are dropped and line endings normalised.
 */
public final class PolicyBodySanitizer {

    public static final String CODE = "POLICY_BODY_INVALID";

    private static final Pattern TAG = Pattern.compile("<\\s*[A-Za-z/!?]");
    private static final Pattern IMAGE = Pattern.compile("!\\[");
    private static final Pattern REF_DEFINITION = Pattern.compile("(?m)^\\s{0,3}\\[[^\\]]+\\]:\\s*\\S");
    private static final Pattern LINK = Pattern.compile("\\[[^\\]]*\\]\\(\\s*([^)\\s]*)[^)]*\\)");
    private static final Pattern CONTROL = Pattern.compile("[\\p{Cc}&&[^\\n\\t]]");

    private PolicyBodySanitizer() {}

    /** The cleaned body, or a 422. {@code maxChars} is the admin cap. */
    public static String sanitize(String raw, int maxChars) {
        if (raw == null) throw invalid("The policy text is required.");
        String body = CONTROL.matcher(raw.replace("\r\n", "\n").replace('\r', '\n')).replaceAll("").strip();
        if (body.isEmpty()) throw invalid("The policy text is required.");
        if (body.length() > maxChars) {
            throw OrgException.coded(422, CODE, "The policy is too long: at most " + maxChars + " characters.", Map.of("max", maxChars));
        }
        if (TAG.matcher(body).find()) throw invalid("HTML is not allowed; use plain text with simple formatting (headings, lists, bold, links).");
        if (IMAGE.matcher(body).find()) throw invalid("Images are not allowed in a policy.");
        if (REF_DEFINITION.matcher(body).find()) throw invalid("Write links inline as [text](https://...).");
        Matcher m = LINK.matcher(body);
        while (m.find()) {
            if (!allowedTarget(m.group(1))) throw invalid("A link may only point to an https:// address, a mailto: address or a page on this site.");
        }
        return body;
    }

    /** Whether a link target may be rendered as a clickable link. Shared by the web renderer's rules (same list). */
    static boolean allowedTarget(String target) {
        String t = target == null ? "" : target.strip();
        if (t.isEmpty()) return false;
        String lower = t.toLowerCase(java.util.Locale.ROOT);
        if (lower.startsWith("https://") || lower.startsWith("mailto:")) return true;
        if (t.startsWith("//")) return false;
        return t.startsWith("/") || t.startsWith("#");
    }

    private static OrgException invalid(String message) {
        return OrgException.coded(422, CODE, message, Map.of());
    }
}
