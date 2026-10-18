package com.dossier.api.service.resume;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Canonical form of a {@code ResumeDocument} and its content hash.
 *
 * <p>Canonical form (the TypeScript port must reproduce it exactly):
 * <ol>
 *   <li>Every string <em>value</em> is trimmed with {@link ResumeDocument#trimWs} (keys are untouched).</li>
 *   <li>Every object's keys are sorted ascending by UTF-16 code unit (Java {@code String.compareTo},
 *       JavaScript's default {@code Array.sort}), recursively. Array order is preserved.</li>
 *   <li>Every array under the key {@code marks} whose elements are all {@code {s, e, t}} objects is
 *       sorted by (s, e, t) - ints ascending, then {@code t} by UTF-16 code unit. Other arrays keep their order.</li>
 *   <li>Nulls, booleans and integers are kept as they are; nothing is dropped or defaulted.</li>
 *   <li>Serialised compactly (no whitespace) by {@link ResumeDocumentJson}, UTF-8, no trailing newline.</li>
 * </ol>
 * {@link #contentHash} is the lowercase-hex SHA-256 of those bytes. Two documents that differ only in
 * key order or in leading/trailing whitespace of their strings hash identically.
 */
public final class ResumeDocumentCanonical {

    private ResumeDocumentCanonical() {}

    /** A deep copy of {@code doc} with trimmed string values and sorted object keys. */
    public static JsonNode canonicalize(JsonNode doc) {
        return canon(doc);
    }

    /** The canonical compact JSON text. */
    public static String canonicalJson(JsonNode doc) {
        return ResumeDocumentJson.write(canon(doc), 0);
    }

    /** The canonical UTF-8 bytes (what {@link #contentHash} digests). */
    public static byte[] canonicalBytes(JsonNode doc) {
        return canonicalJson(doc).getBytes(StandardCharsets.UTF_8);
    }

    /** Lowercase-hex SHA-256 of {@link #canonicalBytes}. */
    public static String contentHash(JsonNode doc) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonicalBytes(doc));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static JsonNode canon(JsonNode n) {
        JsonNodeFactory f = JsonNodeFactory.instance;
        if (n == null || n.isMissingNode()) return f.nullNode();
        if (n.isTextual()) return f.textNode(ResumeDocument.trimWs(n.textValue()));
        if (n.isObject()) {
            List<String> keys = new ArrayList<>();
            for (Iterator<Map.Entry<String, JsonNode>> it = n.fields(); it.hasNext();) keys.add(it.next().getKey());
            Collections.sort(keys);
            ObjectNode out = f.objectNode();
            for (String k : keys) {
                JsonNode child = canon(n.get(k));
                out.set(k, k.equals("marks") ? sortMarks(child) : child);
            }
            return out;
        }
        if (n.isArray()) {
            ArrayNode out = f.arrayNode();
            for (JsonNode c : n) out.add(canon(c));
            return out;
        }
        return n;
    }

    /**
     * A {@code marks} array (inline formatting ranges) is sorted by {@code (s, e, t)} so two documents
     * that differ only in the order their marks were added hash identically. Anything that is not a
     * well-formed mark list (not an array, or an element lacking integer s / e or string t) is left as is.
     */
    private static JsonNode sortMarks(JsonNode marks) {
        if (!marks.isArray()) return marks;
        List<JsonNode> list = new ArrayList<>();
        for (JsonNode m : marks) {
            if (!m.isObject() || !m.path("s").isInt() || !m.path("e").isInt() || !m.path("t").isTextual()) return marks;
            list.add(m);
        }
        list.sort(
            Comparator
                .<JsonNode>comparingInt(m -> m.get("s").intValue())
                .thenComparingInt(m -> m.get("e").intValue())
                .thenComparing(m -> m.get("t").textValue())
        );
        ArrayNode out = JsonNodeFactory.instance.arrayNode();
        list.forEach(out::add);
        return out;
    }
}
