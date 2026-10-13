package com.dossier.api.service.resume;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Iterator;
import java.util.Map;

/**
 * Upgrades an older {@code ResumeDocument} to the current schema (DESIGN 3.6). Pure and total: it never
 * mutates its input, never throws, and returns anything it does not recognise as an unchanged copy (the
 * validator then rejects it with a proper path).
 *
 * <pre>
 * PORTING RULES (packages/ui/src/resume/upgrade.ts must produce the same canonical JSON)
 *
 * schema 1 -> 2:
 *   - "schema" becomes 2.
 *   - basics.photoKey (a non-blank string) becomes basics.photo = {"key": photoKey}, at the same
 *     position in the object, and photoKey is removed. A null, blank or non-string photoKey is just
 *     removed. If basics already has a "photo" key, that wins and photoKey is removed.
 *   - nothing else changes (marks absent = none; list / listStyle absent = plain; unknown keys survive).
 * Any other input (not an object, or schema not the integer 1) is returned as an unchanged deep copy.
 * </pre>
 */
public final class ResumeDocumentUpgrader {

    private ResumeDocumentUpgrader() {}

    public static JsonNode upgrade(JsonNode doc) {
        if (doc == null) return null;
        JsonNode copy = doc.deepCopy();
        if (!copy.isObject()) return copy;
        JsonNode schema = copy.get("schema");
        if (schema == null || !schema.isIntegralNumber() || schema.intValue() != 1) return copy;

        ObjectNode out = (ObjectNode) copy;
        out.put("schema", 2);
        JsonNode basics = out.get("basics");
        if (basics != null && basics.isObject() && basics.has("photoKey")) {
            out.set("basics", upgradeBasics((ObjectNode) basics));
        }
        return out;
    }

    private static ObjectNode upgradeBasics(ObjectNode basics) {
        ObjectNode out = JsonNodeFactory.instance.objectNode();
        for (Iterator<Map.Entry<String, JsonNode>> it = basics.fields(); it.hasNext();) {
            Map.Entry<String, JsonNode> e = it.next();
            if (!e.getKey().equals("photoKey")) {
                out.set(e.getKey(), e.getValue());
                continue;
            }
            JsonNode key = e.getValue();
            if (!basics.has("photo") && key.isTextual() && !ResumeDocument.trimWs(key.textValue()).isEmpty()) {
                out.putObject("photo").put("key", key.textValue());
            }
        }
        return out;
    }
}
