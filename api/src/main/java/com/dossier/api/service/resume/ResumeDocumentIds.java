package com.dossier.api.service.resume;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fresh ids for a copied document (R2.6, DESIGN 9.10: {@code source: copy}). An independent copy must not
 * share ids with its source - ids are the unit a "master changed" diff and a profile sync are keyed on -
 * so every section, item and bullet id is replaced by a new random one with the same one-letter prefix
 * ({@code s_}, {@code i_}, {@code b_}) and the pattern the validator expects. A tailored copy
 * (DESIGN 8.9) deliberately does <em>not</em> use this: it keeps the ids so lineage is by id.
 *
 * <p>Only the {@code id} of an object is touched. {@code profileItemId} (a link to the user's profile, still
 * valid for a copy), text, marks and every other field are left exactly as they were.
 */
public final class ResumeDocumentIds {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final Pattern ID = Pattern.compile("([a-z])_[A-Za-z0-9]{6,12}");
    private static final int LENGTH = 8;

    private ResumeDocumentIds() {}

    /** A deep copy of {@code doc} in which every {@code id} is regenerated (unique within the result). */
    public static JsonNode regenerate(JsonNode doc) {
        JsonNode copy = doc.deepCopy();
        walk(copy, new HashSet<>());
        return copy;
    }

    /** {@code <prefix>_<8 alphanumerics>}, not in {@code used} (which it is added to). */
    public static String newId(char prefix, Set<String> used) {
        String id;
        do {
            StringBuilder sb = new StringBuilder().append(prefix).append('_');
            for (int i = 0; i < LENGTH; i++) sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
            id = sb.toString();
        } while (!used.add(id));
        return id;
    }

    private static void walk(JsonNode n, Set<String> used) {
        if (n instanceof ObjectNode o) {
            JsonNode id = o.get("id");
            if (id != null && id.isTextual()) {
                Matcher m = ID.matcher(id.textValue());
                if (m.matches()) o.put("id", newId(m.group(1).charAt(0), used));
            }
            Iterator<Map.Entry<String, JsonNode>> it = o.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                if (!"id".equals(e.getKey())) walk(e.getValue(), used);
            }
        } else if (n instanceof ArrayNode a) {
            for (JsonNode c : a) walk(c, used);
        }
    }
}
