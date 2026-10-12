package com.dossier.api.service.resume;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.Collection;

/**
 * Reads and writes {@code bio.meta_json} (Resume Builder DESIGN 5.1): a small server-only object
 * {@code {provenance:{key:"parsed|user|learned"}, completeness:{score,nextAction,computedAt},
 * seededFromResumeId, onboarding:{...}}}. Tolerant of null or damaged JSON (reads as empty): the
 * column is a cache plus a few markers, never something to fail a request over. Unknown keys
 * (such as {@code onboarding}) survive every rewrite.
 */
public final class ProfileMeta {

    public static final String PROVENANCE = "provenance";
    public static final String COMPLETENESS = "completeness";
    public static final String SEEDED_FROM = "seededFromResumeId";

    private static final ObjectMapper OM = new ObjectMapper();

    private ProfileMeta() {}

    /** The meta object; empty when {@code json} is null, blank, damaged or not an object. */
    public static ObjectNode read(String json) {
        if (json != null && !json.isBlank()) {
            try {
                JsonNode n = OM.readTree(json);
                if (n instanceof ObjectNode o) return o;
            } catch (java.io.IOException e) {
                // fall through to empty
            }
        }
        return OM.createObjectNode();
    }

    public static String write(ObjectNode meta) {
        return meta.toString();
    }

    /** True once the profile has been seeded from (or built from an import of) a resume. */
    public static boolean isSeeded(ObjectNode meta) {
        JsonNode v = meta.get(SEEDED_FROM);
        return v != null && !v.isNull();
    }

    public static void markSeeded(ObjectNode meta, long resumeId) {
        meta.put(SEEDED_FROM, resumeId);
    }

    /** {@code meta.provenance[key] = source} for each key. */
    public static void stamp(ObjectNode meta, Collection<String> keys, String source) {
        if (keys.isEmpty()) return;
        ObjectNode p = provenance(meta);
        for (String k : keys) p.put(k, source);
    }

    /** Drops the provenance of keys that no longer have a value. */
    public static void unstamp(ObjectNode meta, Collection<String> keys) {
        JsonNode p = meta.get(PROVENANCE);
        if (p instanceof ObjectNode o) keys.forEach(o::remove);
    }

    /** The recorded source of a bio key, or {@code null}. */
    public static String sourceOf(ObjectNode meta, String key) {
        JsonNode v = meta.path(PROVENANCE).get(key);
        return v != null && v.isTextual() ? v.textValue() : null;
    }

    /** {@code meta.provenance} as a plain {@code key -> source} map (text values only); empty when there is none. */
    public static java.util.Map<String, String> provenanceOf(String metaJson) {
        java.util.Map<String, String> out = new java.util.LinkedHashMap<>();
        JsonNode p = read(metaJson).get(PROVENANCE);
        if (p instanceof ObjectNode o) {
            o.fields().forEachRemaining(e -> {
                if (e.getValue().isTextual()) out.put(e.getKey(), e.getValue().textValue());
            });
        }
        return out;
    }

    /** {@code meta.completeness = {score, nextAction, computedAt}} (the per-part detail is not cached). */
    public static void putCompleteness(ObjectNode meta, ProfileCompleteness.Result r, Instant now) {
        ObjectNode c = meta.putObject(COMPLETENESS);
        c.put("score", r.score());
        if (r.nextAction() == null) {
            c.putNull("nextAction");
        } else {
            ObjectNode a = c.putObject("nextAction");
            a.put("key", r.nextAction().key());
            a.put("label", r.nextAction().label());
            a.put("href", r.nextAction().href());
        }
        c.put("computedAt", now.toString());
    }

    private static ObjectNode provenance(ObjectNode meta) {
        JsonNode p = meta.get(PROVENANCE);
        return p instanceof ObjectNode o ? o : meta.putObject(PROVENANCE);
    }
}
