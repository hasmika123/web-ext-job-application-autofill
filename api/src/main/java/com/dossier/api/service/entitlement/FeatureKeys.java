package com.dossier.api.service.entitlement;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * The closed registry of catalog feature keys the code may name (docs/subscriptions/02-unified-product-model.md section 2.4, story K1.4). A gate in
 * code asks {@code has(ctx, FeatureKeys.AI_RESUME_TAILORING)}, never a string typed on the spot, and every constant below is a {@code
 * feature_definition} row seeded by {@code CatalogSeedData} ({@code FeatureKeyRegistryTest} proves both directions). Three families:
 *
 * <ul>
 *   <li>services: the keys of the catalog itself (this class's top-level constants);</li>
 *   <li>{@link Capability}: the legacy capability keys a service confers ({@code entitlement_keys_json}), how today's {@code isPro} callers map;</li>
 *   <li>{@link Limit}: the limit keys a service's allowance answers ({@code limit_key}).</li>
 * </ul>
 *
 * Nothing here is a price or an allowance: those are rows an admin edits.
 */
public final class FeatureKeys {

    // ---- individual and shared services -------------------------------------------------
    public static final String BASE_PERSONAL = "base.personal";
    public static final String RESUME_LIBRARY = "resume.library";
    public static final String RESUME_AI_PARSING = "resume.ai_parsing";
    public static final String AI_AUTOFILL = "ai.autofill";
    public static final String ANSWERS_SYNC = "answers.sync";
    public static final String AI_RESUME_TAILORING = "ai.resume_tailoring";
    public static final String RESUME_OPTIMIZATION = "resume.optimization";
    public static final String AI_JOB_MATCHING = "ai.job_matching";
    public static final String MATCHES_BASIC = "matches.basic";
    public static final String INBOX_MONITORING = "inbox.monitoring";
    public static final String INTERVIEW_AI_PREP = "interview.ai_prep";
    public static final String AUTOMATION_APPROVED_APPLY = "automation.approved_apply";
    public static final String ALERTS_ADVANCED = "alerts.advanced";
    public static final String ANALYTICS_APPLICATIONS = "analytics.applications";
    public static final String BUILDER_AI = "builder.ai";
    public static final String AI_CREDITS_EXTRA = "ai.credits_extra";
    public static final String RESUME_EXTRA_PACK = "resume.extra_pack";
    public static final String SUPPORT_PRIORITY = "support.priority";

    // ---- organization services ------------------------------------------------------------
    public static final String BASE_CONSULTANT = "base.consultant";
    public static final String RESUME_ADVANCED_VERSIONS = "resume.advanced_versions";
    public static final String MARKETING_ASSISTED_APPLICATIONS = "marketing.assisted_applications";
    public static final String MODULE_TALENT_MARKETING = "module.talent_marketing";

    // ---- non-purchasable keys dependencies point at (category MODULE, HIDDEN) -------------
    public static final String INTEGRATION_INBOX_CONNECTED = "integration.inbox_connected";
    public static final String INTEGRATION_EXTENSION_CONNECTED = "integration.extension_connected";
    public static final String CONSENT_ACT_FOR = "consent.act_for";
    public static final String CONSENT_RESUME_EDIT = "consent.resume_edit";
    public static final String CONSENT_RESUME_VIEW_ORG = "consent.resume_view_org";
    public static final String CONSENT_AI_TAILORING = "consent.ai_tailoring";
    public static final String CONSENT_AI_OPTIMIZATION = "consent.ai_optimization";
    public static final String CONSENT_MARKETING_ASSIST = "consent.marketing_assist";

    /** The capability keys a service confers: what the legacy {@code isPro} call sites ask about (06-entitlements-and-enforcement.md section 4). */
    public static final class Capability {
        public static final String AI_SERVER = "ai.server";
        public static final String ANSWERS_SYNC = "answers.sync";
        public static final String INBOX = "inbox";
        public static final String MATCHES_AI_SCORED = "matches.ai_scored";
        public static final String INTERVIEW_AI_PRACTICE = "interview.ai_practice";
        public static final String AUTOPILOT_APPS_PER_MONTH = "autopilot.apps_per_month";
        public static final String AUTOPILOT_APPS_PER_DAY = "autopilot.apps_per_day";
        public static final String ANALYTICS_FULL = "analytics.full";
        public static final String BUILDER_AI = "builder.ai";

        private Capability() {}
    }

    /** The limit keys a service's allowance answers ({@code feature_definition.limit_key}). */
    public static final class Limit {
        public static final String RESUMES_MAX = "resumes.max";
        public static final String MATCHES_PER_DAY = "matches.per_day";
        public static final String ALERTS_MAX = "alerts.max";

        private Limit() {}
    }

    private FeatureKeys() {}

    /** Every service key above, in declaration order. */
    public static Set<String> services() {
        return values(FeatureKeys.class);
    }

    public static Set<String> capabilities() {
        return values(Capability.class);
    }

    public static Set<String> limits() {
        return values(Limit.class);
    }

    private static Set<String> values(Class<?> holder) {
        Set<String> out = new LinkedHashSet<>();
        for (Field f : holder.getDeclaredFields()) {
            if (Modifier.isPublic(f.getModifiers()) && Modifier.isStatic(f.getModifiers()) && f.getType() == String.class) {
                try {
                    out.add((String) f.get(null));
                } catch (IllegalAccessException e) {
                    throw new IllegalStateException(e);
                }
            }
        }
        return Collections.unmodifiableSet(out);
    }
}
