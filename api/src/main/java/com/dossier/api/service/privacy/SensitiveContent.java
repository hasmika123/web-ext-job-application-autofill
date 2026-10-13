package com.dossier.api.service.privacy;

import com.dossier.api.service.privacy.SensitivePatterns.Hit;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * {@link SensitivePatterns} applied to JSON: the guard every write path calls on submitted content
 * (profile items, bio values, later resume documents and pastes). Every string value is scanned with
 * its key as the label ({@link SensitivePatterns#scanField}); the first hit is a
 * {@link SensitiveContentException} naming the path and the class, or - for server-side seeding from
 * an already stored resume - {@link #redact} strips the values instead.
 */
public final class SensitiveContent {

    private static final Map<String, String> LABELS = Map.of(
        SensitivePatterns.SSN_ITIN, "a Social Security or tax identification number",
        SensitivePatterns.ROUTING, "a bank routing number",
        SensitivePatterns.IBAN, "an IBAN",
        SensitivePatterns.ACCOUNT_NUMBER, "a bank account number",
        SensitivePatterns.TAX_ID, "a tax id (EIN or VAT number)",
        SensitivePatterns.PASSPORT, "a passport number",
        SensitivePatterns.VISA_DOC, "a visa, permit or identity document number",
        SensitivePatterns.DOB, "a date of birth"
    );

    private SensitiveContent() {}

    /** Plain-language name of a class code, for messages. */
    public static String label(String cls) {
        return LABELS.getOrDefault(cls, "sensitive personal data");
    }

    /** Throws if {@code value} (stored under {@code key}, reported at {@code path}) holds a never-collected value. */
    public static void check(String path, String key, String value) {
        List<Hit> hits = SensitivePatterns.scanField(key, value);
        if (!hits.isEmpty()) throw new SensitiveContentException(path, hits.get(0).cls());
    }

    /** Scans every string in {@code node}; {@code path} prefixes the reported location ("" for the root). */
    public static void check(String path, JsonNode node) {
        walkCheck(path, null, node);
    }

    private static void walkCheck(String path, String key, JsonNode node) {
        if (node == null) return;
        if (node.isTextual()) {
            check(path, key, node.textValue());
        } else if (node.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = node.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                walkCheck(path.isEmpty() ? e.getKey() : path + "." + e.getKey(), e.getKey(), e.getValue());
            }
        } else if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) walkCheck(path + "[" + i + "]", key, node.get(i));
        }
    }

    /** Replaces every sensitive value in {@code node}'s strings, in place; returns how many were removed. */
    public static int redact(JsonNode node) {
        return walkRedact(null, node);
    }

    private static int walkRedact(String key, JsonNode node) {
        int removed = 0;
        if (node instanceof ObjectNode o) {
            Iterator<Map.Entry<String, JsonNode>> it = o.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                JsonNode v = e.getValue();
                if (v.isTextual()) {
                    int n = SensitivePatterns.scanField(e.getKey(), v.textValue()).size();
                    if (n > 0) {
                        e.setValue(o.textNode(SensitivePatterns.redactField(e.getKey(), v.textValue())));
                        removed += n;
                    }
                } else {
                    removed += walkRedact(e.getKey(), v);
                }
            }
        } else if (node instanceof ArrayNode a) {
            for (int i = 0; i < a.size(); i++) {
                JsonNode v = a.get(i);
                if (v.isTextual()) {
                    int n = SensitivePatterns.scanField(key, v.textValue()).size();
                    if (n > 0) {
                        a.set(i, a.textNode(SensitivePatterns.redactField(key, v.textValue())));
                        removed += n;
                    }
                } else {
                    removed += walkRedact(key, v);
                }
            }
        }
        return removed;
    }
}
