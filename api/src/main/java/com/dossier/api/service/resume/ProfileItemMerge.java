package com.dossier.api.service.resume;

import com.dossier.api.domain.enumeration.ProfileSection;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * How an imported or seeded item is matched against what the profile already holds (Resume Builder
 * DESIGN v1 2.2: "merge by title + company, never duplicates"), and how a match is merged.
 *
 * <p>An item's <b>identity key</b> is its normalised title + organisation (EXPERIENCE), school +
 * degree (EDUCATION), group name (SKILL), language name, link URL, or title + organisation for the
 * other kinds. Normalised = lower-case, punctuation to single spaces, trailing legal-entity words
 * ({@code inc, llc, ltd, corp, ...}) dropped. A blank identity (nothing to match on) never matches.
 *
 * <p><b>Merging</b> into an existing item is deliberately conservative - the user's data wins: blank
 * fields are filled from the incoming item, missing bullets and skills are appended, nothing existing
 * is overwritten or removed. Returns whether anything changed.
 */
public final class ProfileItemMerge {

    private static final JsonNodeFactory F = JsonNodeFactory.instance;
    private static final Pattern NON_ALNUM = Pattern.compile("[^\\p{L}\\p{N}]+");
    private static final Set<String> ENTITY_WORDS = Set.of("inc", "incorporated", "llc", "ltd", "limited", "corp", "corporation", "co", "company", "gmbh", "plc", "llp");

    private ProfileItemMerge() {}

    /** The identity key of {@code data} within {@code section}, or {@code null} when it has none. */
    public static String identityKey(ProfileSection section, JsonNode data) {
        String key;
        switch (section) {
            case EXPERIENCE -> key = join(first(data, "title", "position", "role", "name"), first(data, "org", "company", "organization", "employer"));
            case EDUCATION -> key = join(first(data, "school", "institution", "org"), first(data, "degree"));
            case SKILL -> key = norm(first(data, "group", "name", "category"));
            case LANGUAGE -> key = norm(first(data, "name", "language"));
            case LINK -> key = url(first(data, "url", "link"));
            default -> {
                String title = first(data, "title", "name", "text");
                key = title.isEmpty() ? "" : join(title, first(data, "org", "issuer", "organization", "publisher", "company"));
            }
        }
        return key.replace("|", "").isEmpty() ? null : section.name() + ":" + key;
    }

    private static String join(String a, String b) {
        String x = norm(a);
        String y = norm(b);
        return x.isEmpty() && y.isEmpty() ? "" : x + "|" + y;
    }

    private static String first(JsonNode data, String... fields) {
        for (String f : fields) {
            JsonNode v = data == null ? null : data.get(f);
            if (v != null && v.isTextual() && !ResumeDocument.trimWs(v.textValue()).isEmpty()) return v.textValue();
        }
        return "";
    }

    /** Lower-case, punctuation to spaces, trailing legal-entity words dropped. */
    public static String norm(String s) {
        if (s == null) return "";
        String t = NON_ALNUM.matcher(s.toLowerCase(Locale.ROOT)).replaceAll(" ").trim();
        String[] words = t.isEmpty() ? new String[0] : t.split(" ");
        int n = words.length;
        while (n > 1 && ENTITY_WORDS.contains(words[n - 1])) n--;
        return String.join(" ", java.util.Arrays.copyOf(words, n));
    }

    private static String url(String u) {
        String t = ResumeDocument.trimWs(u).toLowerCase(Locale.ROOT).replaceFirst("^[a-z]+://", "").replaceFirst("^www\\.", "");
        while (t.endsWith("/")) t = t.substring(0, t.length() - 1);
        return t;
    }

    /**
     * Fills blanks of {@code existing} from {@code incoming}, appends bullets / skills it lacks.
     *
     * @return true when {@code existing} changed
     */
    public static boolean merge(ObjectNode existing, JsonNode incoming) {
        if (incoming == null || !incoming.isObject()) return false;
        boolean changed = false;
        Iterator<Map.Entry<String, JsonNode>> it = incoming.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            String field = e.getKey();
            JsonNode inc = e.getValue();
            JsonNode cur = existing.get(field);
            if (inc.isArray() && ("bullets".equals(field) || "skills".equals(field))) {
                changed |= mergeList(existing, field, (ArrayNode) inc, cur);
            } else if (isBlank(cur) && !isBlank(inc)) {
                existing.set(field, inc);
                changed = true;
            }
        }
        return changed;
    }

    private static boolean mergeList(ObjectNode existing, String field, ArrayNode incoming, JsonNode cur) {
        ArrayNode target = cur instanceof ArrayNode a ? a : existing.putArray(field);
        Set<String> have = new HashSet<>();
        for (JsonNode n : target) have.add(norm(text(n)));
        boolean changed = false;
        for (JsonNode n : incoming) {
            String k = norm(text(n));
            if (!k.isEmpty() && have.add(k)) {
                target.add(n);
                changed = true;
            }
        }
        return changed;
    }

    /** A list entry's text: the string itself, or the {@code text} / {@code name} of an object entry. */
    static String text(JsonNode n) {
        if (n == null) return "";
        if (n.isTextual()) return n.textValue();
        if (n.isObject()) return ResumeDocument.str(n, "text").isEmpty() ? ResumeDocument.str(n, "name") : ResumeDocument.str(n, "text");
        return "";
    }

    private static boolean isBlank(JsonNode n) {
        if (n == null || n.isNull()) return true;
        if (n.isTextual()) return ResumeDocument.trimWs(n.textValue()).isEmpty();
        if (n.isArray() || n.isObject()) return n.isEmpty();
        return false;
    }

    /** A new empty object, for callers that build items. */
    public static ObjectNode newObject() {
        return F.objectNode();
    }
}
