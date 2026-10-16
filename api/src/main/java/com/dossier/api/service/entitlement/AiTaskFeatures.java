package com.dossier.api.service.entitlement;

import com.dossier.api.service.ai.AiTask;

/** Which catalog service an AI task serves, for the {@code ai_call.feature_key} column (story K7.2, docs/subscriptions/06 section 6). */
public final class AiTaskFeatures {

    private AiTaskFeatures() {}

    /** The service key of {@code task}, or null for a task that serves no service (the admin probe). */
    public static String featureOf(AiTask task) {
        if (task == null) return null;
        return switch (task) {
            case DRAFT, PICK, MAP, ENRICH -> FeatureKeys.AI_AUTOFILL;
            case PARSE -> FeatureKeys.RESUME_AI_PARSING;
            case MATCH, JOBS -> FeatureKeys.AI_JOB_MATCHING;
            case FIT -> FeatureKeys.RESUME_OPTIMIZATION;
            case TAILOR -> FeatureKeys.AI_RESUME_TAILORING;
            case INBOX -> FeatureKeys.INBOX_MONITORING;
            case REWRITE, SUMMARY, SUGGEST, COVER, TRANSLATE -> FeatureKeys.BUILDER_AI;
            case PROBE -> null;
        };
    }
}
