package com.dossier.api.service.catalog.seed;

import static com.dossier.api.service.entitlement.FeatureKeys.*;

import java.util.List;

/**
 * The catalog the code gates on, as data (docs/subscriptions/02-unified-product-model.md section 2.4 for the individual world, docs/enterprise-v2/
 * 21-feature-catalog.md sections 3 and 6 for the organization world; story K1.4). Pure Java, no Spring: the Liquibase seed ({@link CatalogSeedChange})
 * and the tests read the same lists.
 *
 * <p><b>No prices.</b> Nothing here creates a {@code product_price} row: the catalog ships with products and no prices, and an admin publishes them.
 * The allowances and AI budgets are documentation of today's behaviour (Free 3 resumes, Pro 25, Autopilot 50 come from plan overrides in K2.1); an admin
 * may change every number afterwards, and a rerun never overwrites a row that already exists.
 */
public final class CatalogSeedData {

    /** A service = a {@code feature_definition} row. */
    public record Svc(
        String key, String name, String description, String audience, String category, String usageType, String unit, long allowance, String period,
        int aiBudgetCents, boolean consumesAi, boolean stackable, Integer maxQuantity, boolean additive, List<String> entitlementKeys, String limitKey,
        String visibility, String poolMode, int sort
    ) {}

    /** A product = a {@code product} row (what can be priced); no price. */
    public record Prod(String code, String name, String kind, String soldTo, String featureKey, String quantityBasis, String roleKey, String description, int sort) {}

    /** A dependency row: {@code feature} needs {@code requires} under {@code kind}. */
    public record Dep(String feature, String requires, String kind, String note) {}

    /** A secondary cap of a service. */
    public record Lim(String feature, String limitKey, long value, String period) {}

    /** A preset: a shortcut over services, no price. Seeded inactive. */
    public record Preset(String key, String name, String description, List<String> features, String mirrorsProductCode, int sort) {}

    private static final String NONE = "none";

    public static final List<Svc> SERVICES = List.of(
        // ---- the individual world and the services both worlds share (02 section 2.4) ----
        svc(BASE_PERSONAL, "Kiwiply core", "Autofill on every supported application site, the job board, capture, your profile and on-device learned answers. The free base of every plan.", "INDIVIDUAL", "BASE", "ACCESS", NONE, 0, "MONTH", 0, false, false, null, false, List.of(), null, "PUBLIC", "PER_CONSULTANT", 10),
        svc(RESUME_LIBRARY, "Resume library", "How many resumes you can keep at once (archived resumes do not count).", "BOTH", "RESUME", "PRODUCTIVITY", "resumes", 3, "PERIOD", 0, false, false, null, false, List.of(), Limit.RESUMES_MAX, "PUBLIC", "PER_CONSULTANT", 20),
        svc(RESUME_AI_PARSING, "AI resume parsing", "Turn an uploaded resume into a structured profile. One parse per resume slot.", "BOTH", "RESUME", "AI_FEATURE", "parses", 3, "PERIOD", 20, true, false, null, false, List.of(), null, "PUBLIC", "PER_CONSULTANT", 30),
        svc(AI_AUTOFILL, "Kiwiply AI for autofill", "Kiwiply's own AI maps fields, picks answers and drafts long answers while you apply.", "INDIVIDUAL", "AUTOFILL", "AI_FEATURE", "operations", 2000, "PERIOD", 150, true, false, null, false, List.of(Capability.AI_SERVER), null, "PUBLIC", "PER_CONSULTANT", 40),
        svc(ANSWERS_SYNC, "Learned answers sync", "Your learned answers follow you across devices.", "INDIVIDUAL", "SYNC", "PRODUCTIVITY", "syncs", 5000, "PERIOD", 0, false, false, null, false, List.of(Capability.ANSWERS_SYNC), null, "PUBLIC", "PER_CONSULTANT", 50),
        svc(AI_RESUME_TAILORING, "AI resume tailoring", "Tailor a resume to a job posting.", "BOTH", "RESUME", "AI_FEATURE", "tailorings", 40, "PERIOD", 125, true, false, null, false, List.of(), null, "PUBLIC", "PER_CONSULTANT", 60),
        svc(RESUME_OPTIMIZATION, "Resume optimization", "ATS and keyword optimization passes on a resume.", "BOTH", "RESUME", "AI_FEATURE", "optimizations", 40, "PERIOD", 50, true, false, null, false, List.of(), null, "PUBLIC", "PER_CONSULTANT", 70),
        svc(AI_JOB_MATCHING, "AI job matching", "AI-scored job matches every day.", "BOTH", "MATCHING", "AI_FEATURE", "matches", 300, "PERIOD", 75, true, false, null, false, List.of(Capability.MATCHES_AI_SCORED), Limit.MATCHES_PER_DAY, "PUBLIC", "PER_CONSULTANT", 80),
        svc(MATCHES_BASIC, "Daily job matches", "Rule-ranked job matches, no AI.", "INDIVIDUAL", "MATCHING", "PRODUCTIVITY", "matches", 3, "DAY", 0, false, false, null, false, List.of(), Limit.MATCHES_PER_DAY, "PUBLIC", "PER_CONSULTANT", 90),
        svc(INBOX_MONITORING, "Inbox monitoring", "Your own Gmail over IMAP: application mail moves your applications. We never send, move or delete mail.", "BOTH", "EMAIL", "INTEGRATION", "connections", 1, "PERIOD", 60, true, false, null, false, List.of(Capability.INBOX), null, "PUBLIC", "PER_CONSULTANT", 100),
        svc(INTERVIEW_AI_PREP, "AI interview practice", "Text-based AI interview practice.", "BOTH", "INTERVIEW", "AI_FEATURE", "sessions", 20, "PERIOD", 150, true, false, null, false, List.of(Capability.INTERVIEW_AI_PRACTICE), null, "PUBLIC", "PER_CONSULTANT", 110),
        svc(AUTOMATION_APPROVED_APPLY, "Autopilot prepare", "Prepares approved applications in your own browser and stops before submit. You always submit.", "BOTH", "AUTOMATION", "AI_FEATURE", "operations", 300, "PERIOD", 300, true, false, null, false, List.of(Capability.AUTOPILOT_APPS_PER_MONTH, Capability.AUTOPILOT_APPS_PER_DAY), null, "PUBLIC", "PER_CONSULTANT", 120),
        svc(ALERTS_ADVANCED, "Advanced alerts", "Instant alerts and saved searches.", "BOTH", "ALERTS", "PRODUCTIVITY", "alerts", 500, "PERIOD", 0, false, false, null, false, List.of(), Limit.ALERTS_MAX, "PUBLIC", "PER_CONSULTANT", 130),
        svc(ANALYTICS_APPLICATIONS, "Application analytics", "Application analytics and exports.", "BOTH", "ANALYTICS", "ANALYTICS", "reports", 100, "PERIOD", 0, false, false, null, false, List.of(Capability.ANALYTICS_FULL), null, "PUBLIC", "PER_CONSULTANT", 140),
        svc(BUILDER_AI, "Resume builder AI assist", "AI help inside the resume builder.", "INDIVIDUAL", "RESUME", "AI_FEATURE", "assists", 200, "PERIOD", 80, true, false, null, false, List.of(Capability.BUILDER_AI), null, "PUBLIC", "PER_CONSULTANT", 150),
        svc(AI_CREDITS_EXTRA, "Extra AI credits", "Extra AI budget for any AI service you already have. Each unit adds one credit.", "BOTH", "AI_CREDITS", "AI_FEATURE", "credits", 1, "PERIOD", 75, false, true, 4, false, List.of(), null, "PUBLIC", "PER_CONSULTANT", 160),
        svc(RESUME_EXTRA_PACK, "Extra resume pack", "Ten more resumes per pack, on top of your plan.", "INDIVIDUAL", "RESUME", "PRODUCTIVITY", "resumes", 10, "PERIOD", 0, false, true, 3, true, List.of(), Limit.RESUMES_MAX, "PUBLIC", "PER_CONSULTANT", 170),
        svc(SUPPORT_PRIORITY, "Priority support", "Your questions are answered first.", "BOTH", "SUPPORT", "SUPPORT", NONE, 0, "MONTH", 0, false, false, null, false, List.of(), null, "PUBLIC", "PER_CONSULTANT", 180),
        // ---- the organization world (21 section 3) ----
        svc(BASE_CONSULTANT, "Consultant workspace", "The consultant workspace: profile overlay, organization-managed resume links and approvals, rule-ranked job discovery, application tracking, interview coordination, notifications and standard alerts.", "ORG", "BASE", "ACCESS", NONE, 0, "PERIOD", 0, false, false, null, false, List.of(), null, "PUBLIC", "PER_CONSULTANT", 200),
        svc(RESUME_ADVANCED_VERSIONS, "Advanced resume versions", "Versions beyond the base cap, compare, branch and per-client variants.", "ORG", "RESUME", "PRODUCTIVITY", "versions", 50, "PERIOD", 0, false, false, null, false, List.of(), null, "PUBLIC", "PER_CONSULTANT", 210),
        svc(MARKETING_ASSISTED_APPLICATIONS, "Marketer-assisted applications", "A marketer prepares applications and submission packs for the consultant. Nobody but the consultant submits.", "ORG", "MARKETING", "AI_FEATURE", "preparations", 60, "PERIOD", 75, true, false, null, false, List.of(), null, "PUBLIC", "PER_CONSULTANT", 220),
        svc(MODULE_TALENT_MARKETING, "Talent marketing workspace", "The marketing workspace for the people who prepare applications for consultants (priced per marketer).", "ORG", "MODULE", "ACCESS", NONE, 0, "PERIOD", 400, false, false, null, false, List.of(), null, "PUBLIC", "ORG_POOL", 230),
        // ---- non-purchasable keys that dependencies point at (21 section 2.5) ----
        hidden(INTEGRATION_INBOX_CONNECTED, "Inbox connected", "The consultant has connected their own Gmail.", "BOTH", 300),
        hidden(INTEGRATION_EXTENSION_CONNECTED, "Extension connected", "The consultant's browser extension is connected.", "BOTH", 310),
        hidden(CONSENT_ACT_FOR, "Consent: act for me", "The consultant's full share naming the marketer.", "ORG", 320),
        hidden(CONSENT_RESUME_EDIT, "Consent: edit my resumes", "The consultant lets the organization edit their resumes.", "ORG", 330),
        hidden(CONSENT_RESUME_VIEW_ORG, "Consent: organization may view my resumes", "The consultant lets the organization view their resumes.", "ORG", 340),
        hidden(CONSENT_AI_TAILORING, "Consent: AI tailoring", "The consultant allows AI tailoring of their resume.", "ORG", 350),
        hidden(CONSENT_AI_OPTIMIZATION, "Consent: AI optimization", "The consultant allows AI optimization of their resume.", "ORG", 360),
        hidden(CONSENT_MARKETING_ASSIST, "Consent: marketing assistance", "The consultant allows a marketer to assist with their applications.", "ORG", 370)
    );

    public static final List<Prod> PRODUCTS = List.of(
        // ---- the individual world (08 section 5 step 1) ----
        prod("PRO", "Pro", "SUBSCRIPTION", "INDIVIDUAL", null, null, null, "Pro subscription for an individual.", 1),
        prod("AUTOPILOT", "Autopilot", "SUBSCRIPTION", "INDIVIDUAL", null, null, null, "Autopilot subscription for an individual.", 2),
        prod("FEAT_AI_CREDITS", "Extra AI credits", "FEATURE", "BOTH", AI_CREDITS_EXTRA, null, null, "Add-on: extra AI credits, bought per unit.", 10),
        prod("FEAT_RESUME_PACK", "Extra resume pack", "FEATURE", "INDIVIDUAL", RESUME_EXTRA_PACK, null, null, "Add-on: ten more resumes per pack.", 11),
        prod("FEAT_SUPPORT", "Priority support", "FEATURE", "BOTH", SUPPORT_PRIORITY, null, null, "Add-on: priority support.", 12),
        // ---- the organization world and the shared add-ons (21 section 6) ----
        prod("ORG_SETUP_FEE", "Organization setup fee", "FEE", "ORG", null, null, null, "One-time fee charged once when an organization starts.", 20),
        prod("ORG_PLATFORM_FEE", "Organization platform fee", "FEE", "ORG", null, null, null, "Optional recurring platform fee for an organization.", 21),
        prod("ORG_BASE_LICENSE", "Consultant base license", "BASE_LICENSE", "ORG", BASE_CONSULTANT, null, null, "The mandatory per-consultant license.", 22),
        prod("FEAT_AI_JOB_MATCHING", "AI job matching", "FEATURE", "BOTH", AI_JOB_MATCHING, null, null, "Add-on: AI-scored job matches.", 30),
        prod("FEAT_AI_RESUME_TAILORING", "AI resume tailoring", "FEATURE", "BOTH", AI_RESUME_TAILORING, null, null, "Add-on: tailor a resume to a posting.", 31),
        prod("FEAT_RESUME_OPTIMIZATION", "Resume optimization", "FEATURE", "BOTH", RESUME_OPTIMIZATION, null, null, "Add-on: ATS and keyword optimization.", 32),
        prod("FEAT_RESUME_ADV_VERSIONS", "Advanced resume versions", "FEATURE", "ORG", RESUME_ADVANCED_VERSIONS, null, null, "Add-on: advanced resume versions.", 33),
        prod("FEAT_INBOX_MONITORING", "Inbox monitoring", "FEATURE", "BOTH", INBOX_MONITORING, null, null, "Add-on: inbox monitoring.", 34),
        prod("FEAT_MARKETING_ASSISTED", "Marketer-assisted applications", "FEATURE", "ORG", MARKETING_ASSISTED_APPLICATIONS, null, null, "Add-on: marketer-assisted applications.", 35),
        prod("FEAT_INTERVIEW_AI_PREP", "AI interview practice", "FEATURE", "BOTH", INTERVIEW_AI_PREP, null, null, "Add-on: AI interview practice.", 36),
        prod("FEAT_ALERTS_ADVANCED", "Advanced alerts", "FEATURE", "BOTH", ALERTS_ADVANCED, null, null, "Add-on: advanced alerts.", 37),
        prod("FEAT_ANALYTICS_APPLICATIONS", "Application analytics", "FEATURE", "BOTH", ANALYTICS_APPLICATIONS, null, null, "Add-on: application analytics.", 38),
        prod("FEAT_AUTOMATION_APPROVED_APPLY", "Autopilot prepare", "FEATURE", "BOTH", AUTOMATION_APPROVED_APPLY, null, null, "Add-on: Autopilot prepare.", 39),
        prod("MOD_TALENT_MARKETING", "Talent marketing workspace", "ORG_MODULE", "ORG", MODULE_TALENT_MARKETING, "PER_ROLE", "MARKETING_SPECIALIST", "Organization module, priced per marketer.", 40)
    );

    /** The secondary caps of 21 section 3.1. */
    public static final List<Lim> LIMITS = List.of(
        new Lim(AI_JOB_MATCHING, "matches.per_day", 20, "DAY"),
        new Lim(AUTOMATION_APPROVED_APPLY, "operations.per_day", 30, "DAY")
    );

    /** The dependency graph of 21 section 3.4 (authoritative) plus the individual-world anyOf rule. A dependency on a service not offered to a plan's audience does not apply to that plan. */
    public static final List<Dep> DEPENDENCIES = List.of(
        dep(AI_JOB_MATCHING, BASE_CONSULTANT, "TECHNICAL", "A license always has a base."),
        dep(AI_RESUME_TAILORING, BASE_CONSULTANT, "TECHNICAL", "A license always has a base."),
        dep(RESUME_OPTIMIZATION, BASE_CONSULTANT, "TECHNICAL", "A license always has a base."),
        dep(RESUME_ADVANCED_VERSIONS, BASE_CONSULTANT, "TECHNICAL", "A license always has a base."),
        dep(INBOX_MONITORING, BASE_CONSULTANT, "TECHNICAL", "A license always has a base."),
        dep(MARKETING_ASSISTED_APPLICATIONS, BASE_CONSULTANT, "TECHNICAL", "A license always has a base."),
        dep(INTERVIEW_AI_PREP, BASE_CONSULTANT, "TECHNICAL", "A license always has a base."),
        dep(ALERTS_ADVANCED, BASE_CONSULTANT, "TECHNICAL", "A license always has a base."),
        dep(ANALYTICS_APPLICATIONS, BASE_CONSULTANT, "TECHNICAL", "A license always has a base."),
        dep(AUTOMATION_APPROVED_APPLY, BASE_CONSULTANT, "TECHNICAL", "A license always has a base."),
        dep(AI_CREDITS_EXTRA, BASE_CONSULTANT, "TECHNICAL", "A license always has a base."),
        dep(MARKETING_ASSISTED_APPLICATIONS, CONSENT_ACT_FOR, "CONSENT", "The consultant's full share naming the marketer."),
        dep(AI_RESUME_TAILORING, CONSENT_AI_TAILORING, "CONSENT", "Per-consultant consent."),
        dep(RESUME_OPTIMIZATION, CONSENT_AI_OPTIMIZATION, "CONSENT", "Per-consultant consent."),
        dep(AUTOMATION_APPROVED_APPLY, INTEGRATION_EXTENSION_CONNECTED, "INTEGRATION", "Licensed, but refused until the extension is connected."),
        dep(AUTOMATION_APPROVED_APPLY, AI_JOB_MATCHING, "COMMERCIAL", "Prepares only matched or approved jobs."),
        dep(INBOX_MONITORING, INTEGRATION_INBOX_CONNECTED, "INTEGRATION", "The consultant connects their own Gmail."),
        dep(AI_CREDITS_EXTRA, "any:consumes_ai", "COMMERCIAL", "Needs at least one AI service.")
    );

    /** Presets of 21 section 3.5, seeded inactive; an admin activates them. */
    public static final List<Preset> PRESETS = List.of(
        new Preset("JOB_SEARCH_ESSENTIALS", "Job Search Essentials", "Base, AI job matching and advanced alerts.", List.of(BASE_CONSULTANT, AI_JOB_MATCHING, ALERTS_ADVANCED), null, 1),
        new Preset("RESUME_AI_SUPPORT", "Resume & AI Support", "Base, tailoring, optimization and advanced resume versions.", List.of(BASE_CONSULTANT, AI_RESUME_TAILORING, RESUME_OPTIMIZATION, RESUME_ADVANCED_VERSIONS), "PRO", 2),
        new Preset("TALENT_MARKETING_SUPPORT", "Talent Marketing Support", "Base, marketer-assisted applications, inbox monitoring and analytics.", List.of(BASE_CONSULTANT, MARKETING_ASSISTED_APPLICATIONS, INBOX_MONITORING, ANALYTICS_APPLICATIONS), null, 3),
        new Preset("INTERVIEW_SUPPORT", "Interview Support", "Base and AI interview practice.", List.of(BASE_CONSULTANT, INTERVIEW_AI_PREP), null, 4),
        new Preset("FULL_CAREER_SUPPORT", "Full Career Support", "Base and every service except extra AI credits.",
            List.of(BASE_CONSULTANT, AI_JOB_MATCHING, AI_RESUME_TAILORING, RESUME_OPTIMIZATION, RESUME_ADVANCED_VERSIONS, INBOX_MONITORING, MARKETING_ASSISTED_APPLICATIONS, INTERVIEW_AI_PREP, ALERTS_ADVANCED, ANALYTICS_APPLICATIONS, AUTOMATION_APPROVED_APPLY), "AUTOPILOT", 5)
    );

    private CatalogSeedData() {}

    /** Every service key the seed creates. */
    public static List<String> serviceKeys() {
        return SERVICES.stream().map(Svc::key).toList();
    }

    /** Every capability key the seeded services confer ({@code entitlement_keys_json}). */
    public static List<String> capabilityKeys() {
        return SERVICES.stream().flatMap(s -> s.entitlementKeys().stream()).distinct().toList();
    }

    /** Every limit key the seed names (service {@code limit_key} and secondary-cap rows). */
    public static List<String> limitKeys() {
        return java.util.stream.Stream.concat(
            SERVICES.stream().map(Svc::limitKey).filter(java.util.Objects::nonNull),
            LIMITS.stream().map(Lim::limitKey)
        ).distinct().toList();
    }

    private static Svc svc(
        String key, String name, String description, String audience, String category, String usageType, String unit, long allowance, String period, int ai,
        boolean consumesAi, boolean stackable, Integer max, boolean additive, List<String> entitlement, String limitKey, String visibility, String pool, int sort
    ) {
        return new Svc(key, name, description, audience, category, usageType, unit, allowance, period, ai, consumesAi, stackable, max, additive, entitlement, limitKey, visibility, pool, sort);
    }

    private static Svc hidden(String key, String name, String description, String audience, int sort) {
        return new Svc(key, name, description, audience, "MODULE", "ACCESS", NONE, 0, "PERIOD", 0, false, false, null, false, List.of(), null, "HIDDEN", "PER_CONSULTANT", sort);
    }

    private static Prod prod(String code, String name, String kind, String soldTo, String featureKey, String basis, String role, String description, int sort) {
        return new Prod(code, name, kind, soldTo, featureKey, basis, role, description, sort);
    }

    private static Dep dep(String feature, String requires, String kind, String note) {
        return new Dep(feature, requires, kind, note);
    }
}
