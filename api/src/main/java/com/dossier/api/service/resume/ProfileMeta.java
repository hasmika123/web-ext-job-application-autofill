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

    // ---- onboarding markers (Onboarding v2, DESIGN 8.2) ----------------------------------------

    /**
     * The card's markers. {@code resurfacedAt} is the start of the showing that last counted toward
     * {@code resurfaceCount} (DESIGN 6: "once per showing"); it counts again only after a newer dismissal.
     */
    public record OnboardingCard(Instant dismissedAt, Instant snoozedUntil, int resurfaceCount, Instant resurfacedAt) {
        public static OnboardingCard empty() {
            return new OnboardingCard(null, null, 0, null);
        }
    }

    /** {@code meta.onboarding}: persona (a lowercase enum name or null), start / finish times, the origin and the card markers. */
    public record OnboardingMeta(String persona, Instant startedAt, Instant finishedAt, String source, OnboardingCard card) {
        public static OnboardingMeta empty() {
            return new OnboardingMeta(null, null, null, null, OnboardingCard.empty());
        }

        public OnboardingMeta withPersona(String v) {
            return new OnboardingMeta(v, startedAt, finishedAt, source, card);
        }

        public OnboardingMeta withStarted(Instant at, String origin) {
            return new OnboardingMeta(persona, at, finishedAt, origin, card);
        }

        public OnboardingMeta withFinishedAt(Instant at) {
            return new OnboardingMeta(persona, startedAt, at, source, card);
        }

        public OnboardingMeta withCard(OnboardingCard c) {
            return new OnboardingMeta(persona, startedAt, finishedAt, source, c);
        }
    }

    public static final String ONBOARDING = "onboarding";

    /** {@code meta.onboarding}, tolerant: a missing, damaged or wrongly typed value reads as empty. */
    public static OnboardingMeta onboarding(ObjectNode meta) {
        JsonNode o = meta.get(ONBOARDING);
        if (!(o instanceof ObjectNode on)) return OnboardingMeta.empty();
        JsonNode c = on.get("card");
        OnboardingCard card = c instanceof ObjectNode cn
            ? new OnboardingCard(instant(cn, "dismissedAt"), instant(cn, "snoozedUntil"), Math.max(0, cn.path("resurfaceCount").asInt(0)), instant(cn, "resurfacedAt"))
            : OnboardingCard.empty();
        return new OnboardingMeta(text(on, "persona"), instant(on, "startedAt"), instant(on, "finishedAt"), text(on, "source"), card);
    }

    /**
     * Writes {@code value} as {@code meta.onboarding}. Only the known fields are set, so a key some later
     * version added to the object (or to its {@code card}) survives, like every other meta key.
     */
    public static void putOnboarding(ObjectNode meta, OnboardingMeta value) {
        ObjectNode on = meta.get(ONBOARDING) instanceof ObjectNode existing ? existing : meta.putObject(ONBOARDING);
        putText(on, "persona", value.persona());
        putInstant(on, "startedAt", value.startedAt());
        putInstant(on, "finishedAt", value.finishedAt());
        putText(on, "source", value.source());
        ObjectNode card = on.get("card") instanceof ObjectNode existing ? existing : on.putObject("card");
        OnboardingCard c = value.card() == null ? OnboardingCard.empty() : value.card();
        putInstant(card, "dismissedAt", c.dismissedAt());
        putInstant(card, "snoozedUntil", c.snoozedUntil());
        card.put("resurfaceCount", c.resurfaceCount());
        putInstant(card, "resurfacedAt", c.resurfacedAt());
    }

    private static String text(ObjectNode o, String field) {
        JsonNode v = o.get(field);
        return v != null && v.isTextual() && !v.textValue().isBlank() ? v.textValue() : null;
    }

    private static Instant instant(ObjectNode o, String field) {
        String t = text(o, field);
        if (t == null) return null;
        try {
            return Instant.parse(t);
        } catch (java.time.format.DateTimeParseException e) {
            return null;
        }
    }

    private static void putText(ObjectNode o, String field, String v) {
        if (v == null) o.putNull(field);
        else o.put(field, v);
    }

    private static void putInstant(ObjectNode o, String field, Instant v) {
        if (v == null) o.putNull(field);
        else o.put(field, v.toString());
    }

    private static ObjectNode provenance(ObjectNode meta) {
        JsonNode p = meta.get(PROVENANCE);
        return p instanceof ObjectNode o ? o : meta.putObject(PROVENANCE);
    }
}
