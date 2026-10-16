package com.dossier.api.service.entitlement;

import com.dossier.api.service.ProRequiredException;
import java.util.Set;

/**
 * What the personal gates meant before the catalog (docs/subscriptions/06-entitlements-and-enforcement.md sections 3 and 4, story K7.3): which service
 * keys were "Pro only" ({@code isPro}), which were open to everyone, and which legacy error code a refusal keeps. While the catalog resolver is in shadow
 * ({@code billing.catalog.shadow}) this map IS the answer, so every 402 body stays byte-identical; once the shadow is flipped the resolver answers and this
 * map only supplies the legacy {@link #legacyCode(String) code} so today's clients still see {@code PRO_REQUIRED} and {@code RESUME_LIMIT}.
 */
public final class PersonalFeatureMap {

    /** How a key was gated before the catalog. */
    public enum Gate {
        /** Pro or Autopilot only: {@code isPro} said yes. */
        PRO,
        /** Open to every personal account (Free included). */
        OPEN,
        /** No legacy gate existed: only the resolver can answer. */
        UNMAPPED,
    }

    private static final Set<String> PRO_KEYS = Set.of(
        FeatureKeys.AI_AUTOFILL,
        FeatureKeys.ANSWERS_SYNC,
        FeatureKeys.AI_RESUME_TAILORING,
        FeatureKeys.RESUME_OPTIMIZATION,
        FeatureKeys.AI_JOB_MATCHING,
        FeatureKeys.INBOX_MONITORING,
        FeatureKeys.INTERVIEW_AI_PREP,
        FeatureKeys.BUILDER_AI,
        FeatureKeys.Capability.AI_SERVER,
        FeatureKeys.Capability.INBOX,
        FeatureKeys.Capability.MATCHES_AI_SCORED,
        FeatureKeys.Capability.INTERVIEW_AI_PRACTICE
    );

    private static final Set<String> OPEN_KEYS = Set.of(
        FeatureKeys.BASE_PERSONAL,
        FeatureKeys.RESUME_LIBRARY,
        FeatureKeys.RESUME_AI_PARSING,
        FeatureKeys.MATCHES_BASIC
    );

    private PersonalFeatureMap() {}

    public static Gate gate(String key) {
        if (key == null) return Gate.UNMAPPED;
        if (PRO_KEYS.contains(key)) return Gate.PRO;
        if (OPEN_KEYS.contains(key)) return Gate.OPEN;
        return Gate.UNMAPPED;
    }

    /**
     * The error code a refusal of {@code key} keeps, or null when the key had no legacy gate ({@code resume.library} keeps {@code RESUME_LIMIT}, every
     * Pro-gated key {@code PRO_REQUIRED}).
     */
    public static String legacyCode(String key) {
        if (FeatureKeys.RESUME_LIBRARY.equals(key)) return ProRequiredException.CODE_RESUME_LIMIT;
        return gate(key) == Gate.PRO ? ProRequiredException.CODE_PRO_REQUIRED : null;
    }
}
