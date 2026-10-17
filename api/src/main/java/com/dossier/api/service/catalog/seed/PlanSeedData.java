package com.dossier.api.service.catalog.seed;

import static com.dossier.api.service.entitlement.FeatureKeys.*;

import java.util.ArrayList;
import java.util.List;

/**
 * Today's plans as versioned compositions of catalog services (docs/subscriptions/02-unified-product-model.md sections 3.3 and 3.4; story K2.1): FREE,
 * PRO and AUTOPILOT for individuals, ORG_STANDARD for organizations, each as version 1. Behaviour-identical to the code that gates today: nothing reads
 * these rows to decide anything yet (the resolver arrives behind a shadow switch in K7.1).
 *
 * <p><b>No prices.</b> The catalog ships without prices, so only FREE (which has none) is PUBLISHED; PRO, AUTOPILOT and ORG_STANDARD stay DRAFT until an
 * admin publishes their prices and then the version. The allowance overrides below (resumes 3 / 25 / 50, parses 3 / 25 / 50, matches 20 a day, Autopilot
 * 300 a month and 30 a day) and the AI budget caps (Pro 300, Autopilot 600 cents a month) are the locked numbers of today's behaviour. Pure Java.
 */
public final class PlanSeedData {

    /** One service inside a version. */
    public record Comp(String feature, String role, String productCode, Long allowanceOverride, String limitOverridesJson, int defaultQuantity, Integer maxQuantity) {}

    /** One plan with its version 1. */
    public record PlanSpec(
        String planKey, String name, String audience, String planStatus, boolean publicPlan, int sort, String description, String badge, String baseProductCode,
        String intervalsJson, int aiBudgetCapCents, String versionStatus, boolean orgPlan, List<Comp> components
    ) {}

    private static final String MATCHES_20 = "{\"matches.per_day\":20}";
    private static final String AUTOPILOT_LIMITS = "{\"operations.per_day\":30}";

    private static final List<Comp> FREE = List.of(
        inc(BASE_PERSONAL, null, null),
        inc(RESUME_LIBRARY, 3L, null),
        inc(RESUME_AI_PARSING, 3L, null),
        inc(MATCHES_BASIC, null, null)
    );

    public static final List<PlanSpec> PLANS = List.of(
        new PlanSpec("FREE", "Free", "INDIVIDUAL", "PUBLISHED", true, 0,
            "Autofill on every supported site, your job board, capture and your profile. Free, always.", null, null, "[]", 20, "PUBLISHED", false, FREE),
        new PlanSpec("PRO", "Pro", "INDIVIDUAL", "DRAFT", false, 10,
            "Everything in Free plus Kiwiply AI for autofill, resume tailoring and optimization, AI job matching, inbox monitoring and answer sync.", "Most popular", "PRO",
            "[\"MONTH\",\"QUARTER\"]", 300, "DRAFT", false, pro(25L, null)),
        new PlanSpec("AUTOPILOT", "Autopilot", "INDIVIDUAL", "DRAFT", false, 20,
            "Everything in Pro plus Autopilot: prepares approved applications in your own browser and stops before submit.", null, "AUTOPILOT",
            "[\"MONTH\",\"QUARTER\"]", 600, "DRAFT", false, pro(50L, true)),
        new PlanSpec("ORG_STANDARD", "Organization Standard", "ORG", "DRAFT", false, 30,
            "A consultancy plan: a mandatory per-consultant license, optional per-consultant add-ons, a one-time setup fee.", null, null,
            "[\"MONTH\",\"YEAR\"]", 0, "DRAFT", true, org())
    );

    private PlanSeedData() {}

    private static List<Comp> pro(long resumeCap, Boolean autopilot) {
        List<Comp> c = new ArrayList<>();
        c.add(inc(BASE_PERSONAL, null, null));
        c.add(inc(RESUME_LIBRARY, resumeCap, null));
        c.add(inc(RESUME_AI_PARSING, resumeCap, null));
        c.add(inc(MATCHES_BASIC, null, null));
        c.add(inc(AI_AUTOFILL, null, null));
        c.add(inc(ANSWERS_SYNC, null, null));
        c.add(inc(AI_RESUME_TAILORING, null, null));
        c.add(inc(RESUME_OPTIMIZATION, null, null));
        c.add(inc(AI_JOB_MATCHING, null, MATCHES_20));
        c.add(inc(INBOX_MONITORING, null, null));
        c.add(inc(INTERVIEW_AI_PREP, null, null));
        c.add(inc(ALERTS_ADVANCED, null, null));
        c.add(inc(ANALYTICS_APPLICATIONS, null, null));
        c.add(inc(BUILDER_AI, null, null));
        if (Boolean.TRUE.equals(autopilot)) c.add(inc(AUTOMATION_APPROVED_APPLY, 300L, AUTOPILOT_LIMITS));
        // optional add-ons: seeded as components with NO published price, so nothing is sellable until an admin publishes a price (S-06)
        c.add(new Comp(AI_CREDITS_EXTRA, "OPTIONAL", "FEAT_AI_CREDITS", null, null, 1, 4));
        c.add(new Comp(RESUME_EXTRA_PACK, "OPTIONAL", "FEAT_RESUME_PACK", null, null, 1, 3));
        c.add(new Comp(SUPPORT_PRIORITY, "OPTIONAL", "FEAT_SUPPORT", null, null, 1, 1));
        return List.copyOf(c);
    }

    private static List<Comp> org() {
        List<Comp> c = new ArrayList<>();
        c.add(new Comp(BASE_CONSULTANT, "SEAT_BASE", "ORG_BASE_LICENSE", null, null, 1, null));
        c.add(opt(AI_JOB_MATCHING, "FEAT_AI_JOB_MATCHING", null));
        c.add(opt(AI_RESUME_TAILORING, "FEAT_AI_RESUME_TAILORING", null));
        c.add(opt(RESUME_OPTIMIZATION, "FEAT_RESUME_OPTIMIZATION", null));
        c.add(opt(RESUME_ADVANCED_VERSIONS, "FEAT_RESUME_ADV_VERSIONS", null));
        c.add(opt(INBOX_MONITORING, "FEAT_INBOX_MONITORING", null));
        c.add(opt(MARKETING_ASSISTED_APPLICATIONS, "FEAT_MARKETING_ASSISTED", null));
        c.add(opt(INTERVIEW_AI_PREP, "FEAT_INTERVIEW_AI_PREP", null));
        c.add(opt(ALERTS_ADVANCED, "FEAT_ALERTS_ADVANCED", null));
        c.add(opt(ANALYTICS_APPLICATIONS, "FEAT_ANALYTICS_APPLICATIONS", null));
        c.add(opt(AUTOMATION_APPROVED_APPLY, "FEAT_AUTOMATION_APPROVED_APPLY", null));
        c.add(opt(AI_CREDITS_EXTRA, "FEAT_AI_CREDITS", 4));
        return List.copyOf(c);
    }

    private static Comp inc(String feature, Long allowance, String limits) {
        return new Comp(feature, "INCLUDED", null, allowance, limits, 1, null);
    }

    private static Comp opt(String feature, String productCode, Integer max) {
        return new Comp(feature, "SEAT_OPTIONAL", productCode, null, null, 1, max);
    }
}
