package com.dossier.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * Every Resume Builder tunable, declared once (DESIGN 15.2): key, type, default, bounds, description.
 * {@link ResumeBuilderSettings} reads the values over {@code app_setting}; a missing, unparsable or
 * out-of-bounds value falls back to the {@code defaultValue} declared here. The fields are exactly
 * what the A5.1 settings registry needs, so A5 adopts this list without renaming a key.
 *
 * <p>Defaults are stored as the text an admin would type ({@code "true"}, {@code "0.7"}, a JSON
 * document); {@code min}/{@code max} bound INT and DECIMAL values; {@code allowed} lists the values of
 * an ENUM (or STRING) key; {@code jsonCheck} (JSON keys only) is the shape rule beyond "parses".
 *
 * <p>The values here transcribe the DESIGN 15.2 table; {@code ResumeBuilderSettingKeysParityTest}
 * fails when a key named there is missing or its default differs.
 */
public final class ResumeBuilderSettingKeys {

    public enum Type {
        BOOL,
        INT,
        DECIMAL,
        STRING,
        ENUM,
        JSON,
    }

    /**
     * One setting. {@code min}/{@code max}/{@code allowed}/{@code jsonCheck} are null when the key has
     * no such bound.
     */
    public record Key(
        String key,
        Type type,
        String defaultValue,
        Double min,
        Double max,
        List<String> allowed,
        String description,
        Predicate<JsonNode> jsonCheck,
        String area,
        AdminSettingsWriter.Risk risk
    ) {
        /**
         * {@code area} is the key's first dotted segment and {@code risk} is {@link #defaultRisk} when not given
         * (ADMIN-E2E-PLAN 2.1), so every declaration written before A5.1 compiles and behaves unchanged.
         */
        public Key {
            if (area == null || area.isBlank()) area = areaOf(key);
            if (risk == null) risk = defaultRisk(key, type);
        }

        public Key(
            String key,
            Type type,
            String defaultValue,
            Double min,
            Double max,
            List<String> allowed,
            String description,
            Predicate<JsonNode> jsonCheck
        ) {
            this(key, type, defaultValue, min, max, allowed, description, jsonCheck, null, null);
        }

        /** A declaration with an explicit risk (the area is derived). */
        public Key(
            String key,
            Type type,
            String defaultValue,
            Double min,
            Double max,
            List<String> allowed,
            String description,
            Predicate<JsonNode> jsonCheck,
            AdminSettingsWriter.Risk risk
        ) {
            this(key, type, defaultValue, min, max, allowed, description, jsonCheck, null, risk);
        }

        /** The first dotted segment of {@code key} ({@code tracker.list.maxSize} is in {@code tracker}). */
        public static String areaOf(String key) {
            int dot = key.indexOf('.');
            return dot < 0 ? key : key.substring(0, dot);
        }

        /**
         * HIGH for every {@code *.enabled} kill switch and every cap/cost key (a segment named {@code cap}, {@code caps}
         * or {@code cost}); MEDIUM otherwise. A HIGH switch needs a reason only when it is turned OFF
         * (see {@code SettingDefinitions.riskOf}).
         */
        public static AdminSettingsWriter.Risk defaultRisk(String key, Type type) {
            if (type == Type.BOOL && key.endsWith(".enabled")) return AdminSettingsWriter.Risk.HIGH;
            for (String seg : key.split("[._]")) {
                if (seg.equals("cap") || seg.equals("caps") || seg.equals("cost")) return AdminSettingsWriter.Risk.HIGH;
            }
            return AdminSettingsWriter.Risk.MEDIUM;
        }
    }

    // ---- feature switches ---------------------------------------------------
    public static final String FEATURE_BUILDER = "feature.resume_builder.enabled";
    public static final String FEATURE_PHOTO = "feature.resume_photo.enabled";
    public static final String FEATURE_SHARE_LINKS = "feature.resume_share_links.enabled";
    public static final String FEATURE_DOCX = "feature.resume_docx.enabled";
    public static final String FEATURE_PRINT_LAYOUT = "feature.resume_print_layout.enabled";
    public static final String FEATURE_PDF_VIEW = "feature.resume_pdf_view.enabled";
    public static final String FEATURE_JOB_MATCH = "feature.resume_job_match.enabled";
    public static final String FEATURE_TAILOR = "feature.resume_tailor.enabled";
    public static final String AI_FEATURE_RESUME = "ai.feature.resume.enabled";

    // ---- templates and theme ------------------------------------------------
    public static final String TEMPLATES_ENABLED = "resume.templates.enabled";
    public static final String TEMPLATES_DEFAULT = "resume.templates.default";
    public static final String TEMPLATES_OVERRIDES = "resume.templates.overrides";
    public static final String TEMPLATES_POPULAR = "resume.templates.popular";
    public static final String THEME_ACCENT_PALETTE = "resume.theme.accentPalette";

    // ---- document limits ----------------------------------------------------
    public static final String DOC_LIMIT_SECTIONS = "resume.doc.limits.sections";
    public static final String DOC_LIMIT_ITEMS = "resume.doc.limits.items";
    public static final String DOC_LIMIT_BULLETS = "resume.doc.limits.bullets";
    public static final String DOC_LIMIT_BULLET_CHARS = "resume.doc.limits.bulletChars";
    public static final String DOC_LIMIT_SUMMARY_CHARS = "resume.doc.limits.summaryChars";
    public static final String DOC_LIMIT_MARKS = "resume.doc.limits.marks";
    public static final String DOC_LIMIT_DOC_BYTES = "resume.doc.limits.docBytes";

    // ---- Common Profile (R1.1 item limits) ----------------------------------
    public static final String PROFILE_ITEM_MAX_BYTES = "profile.item.maxBytes";
    public static final String PROFILE_ITEMS_MAX_PER_USER = "profile.items.maxPerUser";
    public static final String PROFILE_IMPORT_MAX_ITEMS = "profile.import.maxItems";
    public static final String PROFILE_BIO_VALUE_MAX_CHARS = "profile.bio.valueMaxChars";
    public static final String PROFILE_BIO_SUMMARY_MAX_CHARS = "profile.bio.summaryMaxChars";
    public static final String PROFILE_SETUP_PROMPT_BELOW_PERCENT = "profile.setup.promptBelowPercent";
    public static final String PROFILE_UPLOAD_MAX_BYTES = "profile.upload.maxBytes";

    // ---- versions, photo ----------------------------------------------------
    public static final String VERSIONS_COALESCE_MINUTES = "resume.versions.coalesceMinutes";
    public static final String VERSIONS_RETENTION_AUTO = "resume.versions.retentionAuto";
    public static final String PHOTO_MAX_BYTES = "resume.photo.maxBytes";
    public static final String PHOTO_DISCOURAGED_REGIONS = "resume.photo.discouragedRegions";

    // ---- score --------------------------------------------------------------
    public static final String SCORE_RULESET_VERSION = "resume.score.rulesetVersion";
    public static final String SCORE_GROUP_WEIGHTS = "resume.score.groupWeights";
    public static final String SCORE_WEIGHTS = "resume.score.weights";
    public static final String SCORE_PASS_THRESHOLD = "resume.score.passThreshold";
    public static final String SCORE_BANDS = "resume.score.bands";

    // ---- job match ----------------------------------------------------------
    public static final String MATCH_WEIGHTS = "resume.match.weights";
    public static final String MATCH_KEY_SKILLS_COUNT = "resume.match.keySkillsCount";
    public static final String MATCH_THRESHOLDS = "resume.match.thresholds";
    public static final String JOBMATCH_MIN_JD_CHARS = "resume.jobmatch.minJdChars";
    public static final String JOBMATCH_MAX_JD_CHARS = "resume.jobmatch.maxJdChars";
    public static final String JOBMATCH_EMBEDDINGS = "resume.jobmatch.embeddings.enabled";

    // ---- AI -----------------------------------------------------------------
    public static final String AI_SUGGEST_MAX = "resume.ai.suggestMax";
    public static final String AI_SUGGEST_AUTO_REFRESH = "resume.ai.suggestAutoRefresh";
    public static final String AI_SUGGEST_STALE_MINUTES = "resume.ai.suggestStaleMinutes";
    public static final String AI_REWRITE_MAX_REFS = "resume.ai.rewriteMaxRefs";
    public static final String AI_CAP_RESUME_DAILY = "ai.cap.resume.daily";
    public static final String AI_CAP_TAILOR_DAILY = "ai.cap.tailor.daily";
    public static final String AI_CAP_COVER_DAILY = "ai.cap.cover.daily";
    public static final String AI_CAP_FIT_DAILY = "ai.cap.fit.daily";
    public static final String AI_OUTPUT_TOKENS_REWRITE = "ai.output_tokens_max.rewrite";

    // ---- PDF ----------------------------------------------------------------
    public static final String PDF_TIMEOUT_MS = "resume.pdf.timeoutMs";
    public static final String PDF_MAX_CONCURRENT = "resume.pdf.maxConcurrent";
    public static final String PDF_QUEUE_MAX = "resume.pdf.queueMax";
    public static final String PDF_MAX_FIT_STEPS = "resume.pdf.maxFitSteps";
    public static final String PDF_WAIT_MS = "resume.pdf.waitMs";
    public static final String PDF_SETTLE_MS = "resume.pdf.settleMs";
    public static final String PDF_POLL_MS = "resume.pdf.pollMs";
    public static final String PDF_LEASE_MS = "resume.pdf.leaseMs";
    public static final String PDF_BACKOFF_BASE_MS = "resume.pdf.backoffBaseMs";
    public static final String PDF_BACKOFF_MAX_MS = "resume.pdf.backoffMaxMs";
    public static final String PDF_MAX_ATTEMPTS = "resume.pdf.maxAttempts";
    public static final String PDF_KEEP_PREVIOUS = "resume.pdf.keepPrevious";
    public static final String PDF_VIEW_AUTO_REFRESH = "resume.pdf.viewAutoRefresh";
    /** R3.7: how long a BUSY (limiter said 503) job waits before the next claim. */
    public static final String PDF_BUSY_RETRY_MS = "resume.pdf.busyRetryMs";
    /** R3.7: how often the editor asks {@code pdf-status} while the PDF is not READY. */
    public static final String PDF_STATUS_POLL_MS = "resume.pdf.statusPollMs";
    /** R3.7: how long after the last save the editor keeps asking. */
    public static final String PDF_STATUS_WINDOW_MS = "resume.pdf.statusWindowMs";

    // ---- sharing, views, thumbnails, lists ----------------------------------
    public static final String META_SHARE_WITH_ORG_DEFAULT = "resume.meta.shareWithOrgDefault";
    public static final String SHARE_MAX_GRANTS = "resume.share.maxGrants";
    public static final String SHARE_MAX_LINKS = "resume.share.maxLinks";
    public static final String SHARE_LINK_DEFAULT_DAYS = "resume.share.linkDefaultDays";
    public static final String SHARE_ALLOW_DOWNLOAD_DEFAULT = "resume.share.allowDownloadDefault";
    public static final String VIEWS_RETENTION_DAYS = "resume.views.retentionDays";
    public static final String THUMB_WIDTH = "resume.thumb.width";
    public static final String LIST_QUICK_TIPS = "resume.list.quickTips";
    public static final String LIST_VIRTUALIZE_ABOVE = "resume.list.virtualizeAbove";
    public static final String ORG_RESUMES_NEW_DAYS = "org.resumes.newDays";
    public static final String ORG_RESUMES_PAGE_SIZE = "org.resumes.pageSize";
    public static final String ORG_RESUMES_MAX_SAVED_VIEWS = "org.resumes.maxSavedViews";

    // ---- Organizations (APP-E2E-PLAN 2.2, O1.3 follow-up) --------------------
    /** The org feature flag. An admin-stored value wins; otherwise the {@code dossier.orgs.enabled} property (env ORGS_ENABLED) decides. */
    public static final String FEATURE_ORGS = "feature.orgs.enabled";
    /** How many organizations one person may have created (closed ones count: a slug is still taken). */
    public static final String ORG_LIMIT_CREATED_PER_USER = "org.limits.createdPerUser";
    /** How many groups (departments, cohorts, teams) one organization may have. */
    public static final String ORG_LIMIT_GROUPS_PER_ORG = "org.limits.groupsPerOrg";

    // ---- Onboarding v2 (R1.8, ONBOARDING-V2-DESIGN 11) ----------------------
    public static final String FEATURE_ONBOARDING_V2 = "feature.onboarding_v2.enabled";
    public static final String ONBOARDING_PERSONA_ENABLED = "onboarding.persona.enabled";
    public static final String ONBOARDING_ESTIMATE_MINUTES = "onboarding.estimateMinutes";
    public static final String ONBOARDING_STEP_SECONDS = "onboarding.stepSeconds";
    public static final String ONBOARDING_DRAFT_TTL_DAYS = "onboarding.draft.ttlDays";
    public static final String ONBOARDING_DRAFT_MAX_BYTES = "onboarding.draft.maxBytes";
    public static final String ONBOARDING_RATE_DRAFT_PER_MIN = "onboarding.rate.draftPerMin";
    public static final String ONBOARDING_CARD_SNOOZE_DAYS = "onboarding.card.snoozeDays";
    public static final String ONBOARDING_CARD_RESURFACE_BELOW_PERCENT = "onboarding.card.resurfaceBelowPercent";
    public static final String ONBOARDING_CARD_RESURFACE_AFTER_DAYS = "onboarding.card.resurfaceAfterDays";
    public static final String ONBOARDING_CARD_MAX_RESURFACES = "onboarding.card.maxResurfaces";
    public static final String ONBOARDING_CONFETTI_ENABLED = "onboarding.confetti.enabled";
    public static final String ONBOARDING_MASCOT_ENABLED = "onboarding.mascot.enabled";
    public static final String ONBOARDING_PAYOFF_ACTIONS = "onboarding.payoff.actions";

    /** The flow's steps that have a time estimate (DESIGN 3.1; {@code done} has none). */
    public static final Set<String> ONBOARDING_STEP_KEYS = Set.of("hello", "source", "review", "skills", "you", "prefs");
    /** The actions the payoff screen may offer (DESIGN 5.11). */
    public static final Set<String> ONBOARDING_PAYOFF_ACTION_IDS = Set.of("build_resume", "install_extension", "find_jobs");

    // ---- Applications tracker (APP-E2E U6.x; the interim seam until A5.1 adopts these keys as is) ----
    public static final String TRACKER_LIST_DEFAULT_SIZE = "tracker.list.defaultSize";
    public static final String TRACKER_LIST_MAX_SIZE = "tracker.list.maxSize";
    public static final String TRACKER_SEARCH_MAX_CHARS = "tracker.search.maxChars";
    public static final String TRACKER_GHOSTED_AFTER_DAYS = "tracker.ghostedAfterDays";
    public static final String TRACKER_DETAIL_EVENTS_MAX = "tracker.detail.eventsMax";
    public static final String TRACKER_ACTIVITY_DEFAULT_DAYS = "tracker.activity.defaultDays";
    public static final String TRACKER_ACTIVITY_MAX_DAYS = "tracker.activity.maxDays";
    public static final String TRACKER_BULK_MAX_IDS = "tracker.bulk.maxIds";
    public static final String TRACKER_NOTE_MAX_CHARS = "tracker.note.maxChars";
    public static final String TRACKER_NOTES_MAX_PER_APPLICATION = "tracker.notes.maxPerApplication";
    public static final String TRACKER_INTERVIEWS_MAX_PER_APPLICATION = "tracker.interviews.maxPerApplication";
    public static final String TRACKER_INTERVIEW_NOTES_MAX_CHARS = "tracker.interview.notesMaxChars";
    public static final String TRACKER_INTERVIEW_MAX_DURATION_HOURS = "tracker.interview.maxDurationHours";
    public static final String TRACKER_INTERVIEW_DEFAULT_DURATION_MINUTES = "tracker.interview.defaultDurationMinutes";
    public static final String TRACKER_INTERVIEWS_DEFAULT_RANGE_DAYS = "tracker.interviews.defaultRangeDays";
    public static final String TRACKER_INTERVIEWS_MAX_RANGE_DAYS = "tracker.interviews.maxRangeDays";
    public static final String TRACKER_INTERVIEWS_LIST_MAX = "tracker.interviews.listMax";

    // ---- Notifications (E2E-U7.0, docs/design/user/alerts-notifications.md) ---
    public static final String NOTIFY_DEFAULTS = "notifications.defaults";
    public static final String NOTIFY_EMAIL_ENABLED = "notifications.email.enabled";
    public static final String NOTIFY_QUIET_DEFAULT_ENABLED = "notifications.quiet.defaultEnabled";
    public static final String NOTIFY_QUIET_START_HOUR = "notifications.quiet.defaultStartHour";
    public static final String NOTIFY_QUIET_END_HOUR = "notifications.quiet.defaultEndHour";
    public static final String NOTIFY_DEFAULT_TZ = "notifications.defaultTz";

    // ---- BFF rate limits ----------------------------------------------------
    public static final String RATE_DOC_WRITES_PER_MIN = "resume.rate.docWritesPerMin";
    public static final String RATE_AI_PER_MIN = "resume.rate.aiPerMin";
    public static final String RATE_EXPORT_PER_MIN = "resume.rate.exportPerMin";
    public static final String RATE_PUBLIC_PER_MIN = "resume.rate.publicPerMin";

    /**
     * Names DESIGN 15.2 lists as equal to another key (alias to canonical). Reading an alias reads the
     * canonical key, so there is still one stored value per setting.
     */
    public static final Map<String, String> ALIASES = Map.of(
        "resume.photo.enabled",
        FEATURE_PHOTO,
        "builder.version_retention_auto",
        VERSIONS_RETENTION_AUTO,
        // AI admin config (I1.9): the rewrite ceiling is now one of the per-task route settings.
        AI_OUTPUT_TOKENS_REWRITE,
        "ai.route.rewrite.max_output_tokens"
    );

    // Defaults that more than one place needs (the ones DESIGN 15.2 spells out in prose).
    public static final String DEFAULT_ACCENT_PALETTE = "[\"#16a34a\",\"#2563eb\",\"#7c3aed\",\"#ec4899\",\"#f97316\",\"#eab308\"]";
    public static final String DEFAULT_GROUP_WEIGHTS = "{\"G1\":15,\"G2\":25,\"G3\":20,\"G4\":20,\"G5\":20,\"G6\":10}";
    /** The DESIGN 11.3 rule weights, in rule-id order. */
    public static final String DEFAULT_RULE_WEIGHTS =
        "{\"S1\":4,\"S2\":2,\"S3\":3,\"S4\":2,\"S5\":2," +
        "\"E1\":5,\"E2\":3,\"E3\":3,\"E4\":4,\"E5\":4,\"E6\":2,\"E7\":2," +
        "\"K1\":4,\"K2\":4,\"K3\":2,\"K4\":2,\"K5\":4," +
        "\"F1\":3,\"F2\":1,\"F3\":4,\"F4\":3,\"F5\":2,\"F6\":1,\"F7\":2," +
        "\"M1\":5,\"M2\":4,\"M3\":3," +
        "\"A1\":2,\"A2\":2,\"A3\":1,\"A4\":1,\"A5\":2}";
    /** The DESIGN 11.4 bands (the board's top-band copy verbatim). */
    public static final String DEFAULT_SCORE_BANDS =
        "[{\"min\":80,\"title\":\"Great match!\",\"body\":\"Your resume is well-optimized and ready to impress.\"}," +
        "{\"min\":60,\"title\":\"Good progress\",\"body\":\"A few fixes will make it stand out.\"}," +
        "{\"min\":40,\"title\":\"Getting there\",\"body\":\"Follow the tips below to strengthen it.\"}," +
        "{\"min\":0,\"title\":\"Needs work\",\"body\":\"Start with the checklist below.\"}]";
    public static final String DEFAULT_MATCH_WEIGHTS = "{\"skills\":50,\"title\":15,\"years\":10,\"industry\":15,\"education\":10}";
    public static final String DEFAULT_MATCH_THRESHOLDS = "{\"keySkills\":0.7,\"experience\":0.6,\"industry\":0.6}";
    public static final String DEFAULT_QUICK_TIPS =
        "[\"Create different resumes for different roles\",\"Tailor your resume for each job application\"," +
        "\"Use AI suggestions to improve your content\",\"Keep one primary resume for quick applications\"]";
    public static final String DEFAULT_ONBOARDING_STEP_SECONDS = "{\"hello\":10,\"source\":40,\"review\":45,\"skills\":20,\"you\":15,\"prefs\":30}";
    public static final String DEFAULT_ONBOARDING_PAYOFF_ACTIONS = "[\"build_resume\",\"install_extension\",\"find_jobs\"]";
    /** Out of the box: everything in-app; email only for the news worth an interruption and the locked kinds. */
    public static final String DEFAULT_NOTIFY_MATRIX =
        "{\"APP_STATUS\":{\"inapp\":true,\"email\":\"now\"},\"INTERVIEW_REMINDER\":{\"inapp\":true,\"email\":\"now\"}," +
        "\"PROFILE_SUGGESTION\":{\"inapp\":true,\"email\":\"off\"},\"BILLING\":{\"inapp\":true,\"email\":\"now\"}," +
        "\"SECURITY\":{\"inapp\":true,\"email\":\"now\"},\"SYSTEM\":{\"inapp\":true,\"email\":\"off\"}}";
    public static final String DEFAULT_DISCOURAGED_REGIONS ="[\"US\",\"CA\",\"GB\",\"AU\",\"IE\",\"NZ\"]";

    private static final Pattern HEX = Pattern.compile("#[0-9a-fA-F]{6}");
    private static final Pattern COUNTRY = Pattern.compile("[A-Z]{2}");
    private static final Pattern GROUP_OR_RULE_ID = Pattern.compile("[A-Za-z][A-Za-z0-9]{0,15}");

    private static final List<Key> ALL;
    private static final Map<String, Key> BY_KEY;

    static {
        List<Key> k = new ArrayList<>();
        // Feature switches (route gate and AI kill switch).
        bool(k, FEATURE_BUILDER, true, "Resume Builder routes (503 FEATURE_PAUSED when off).");
        bool(k, FEATURE_PHOTO, true, "Profile photo on resumes (DESIGN 5).");
        bool(k, FEATURE_SHARE_LINKS, true, "Resume share links (DESIGN 8.7).");
        bool(k, FEATURE_DOCX, false, "DOCX export (DESIGN 14).");
        bool(k, FEATURE_PRINT_LAYOUT, true, "Print layout right side-nav view (DESIGN 10.8).");
        bool(k, FEATURE_PDF_VIEW, true, "PDF view right side-nav view (DESIGN 10.8).");
        bool(k, FEATURE_JOB_MATCH, true, "Job Match (DESIGN 12).");
        bool(k, FEATURE_TAILOR, true, "Tailor to Job (DESIGN 12).");
        bool(k, AI_FEATURE_RESUME, true, "Kill switch for the SUGGEST / REWRITE / SUMMARY builder AI tasks (DESIGN 13).");

        // Templates and theme. Only Modern is registered in the web today; the API accepts the three ids in
        // ResumeDocService.KNOWN_TEMPLATE_IDS.
        k.add(
            json(
                TEMPLATES_ENABLED,
                "[\"modern\"]",
                "Template ids offered in the picker (non-empty, each a registered id).",
                n -> idList(n, 1, Integer.MAX_VALUE, ResumeBuilderSettingKeys::isKnownTemplate)
            )
        );
        k.add(
            new Key(
                TEMPLATES_DEFAULT,
                Type.STRING,
                "modern",
                null,
                null,
                knownTemplateIds(),
                "Template a new resume starts with (a registered id).",
                null
            )
        );
        k.add(
            json(
                TEMPLATES_OVERRIDES,
                "{}",
                "Per-template capability overrides; they may only tighten (DESIGN 6.3).",
                n -> {
                    if (!n.isObject()) return false;
                    for (var it = n.fields(); it.hasNext();) {
                        var e = it.next();
                        if (!isKnownTemplate(e.getKey()) || !e.getValue().isObject()) return false;
                    }
                    return true;
                }
            )
        );
        k.add(
            json(
                TEMPLATES_POPULAR,
                "[\"modern\"]",
                "Order of the Popular Templates strip on the list page (default = enabled order).",
                n -> idList(n, 0, Integer.MAX_VALUE, ResumeBuilderSettingKeys::isKnownTemplate)
            )
        );
        k.add(
            json(
                THEME_ACCENT_PALETTE,
                DEFAULT_ACCENT_PALETTE,
                "Accent colour swatches in Customize Template: 3-12 #rrggbb values.",
                n -> idList(n, 3, 12, s -> HEX.matcher(s).matches())
            )
        );

        // Document limits.
        integer(k, DOC_LIMIT_SECTIONS, 20, 5, 50, "Max sections per document.");
        integer(k, DOC_LIMIT_ITEMS, 40, 5, 100, "Max items per section.");
        integer(k, DOC_LIMIT_BULLETS, 12, 3, 30, "Max bullets per item.");
        integer(k, DOC_LIMIT_BULLET_CHARS, 600, 100, 2000, "Max characters per bullet.");
        integer(k, DOC_LIMIT_SUMMARY_CHARS, 2000, 200, 5000, "Max characters in the summary.");
        integer(k, DOC_LIMIT_MARKS, 64, 0, 200, "Max inline marks per text field (schema v2).");
        integer(k, DOC_LIMIT_DOC_BYTES, 262144, 65536, 1048576, "Max serialised document size in bytes.");

        // Common Profile item limits (R1.1).
        integer(k, PROFILE_ITEM_MAX_BYTES, 16384, 1024, 65536, "Max serialised size of one profile item in bytes.");
        integer(k, PROFILE_ITEMS_MAX_PER_USER, 500, 50, 5000, "Max live profile items per user, all sections together.");
        integer(k, PROFILE_IMPORT_MAX_ITEMS, 200, 10, 1000, "Max items in one profile import call.");
        integer(k, PROFILE_BIO_VALUE_MAX_CHARS, 500, 50, 2000, "Max characters of one identity / contact value a profile import writes (not the summary).");
        integer(k, PROFILE_BIO_SUMMARY_MAX_CHARS, 2000, 200, 10000, "Max characters of the profile summary a profile import writes.");
        integer(k, PROFILE_SETUP_PROMPT_BELOW_PERCENT, 40, 0, 100, "The dashboard 'Build your profile' card shows while profile completeness is under this percent (0 hides it).");
        integer(k, PROFILE_UPLOAD_MAX_BYTES, 10485760, 1048576, 10485760, "Max resume file upload in bytes, in the setup wizard and the resume upload (the server's multipart transport limit is 10 MB, so that is the ceiling).");

        // Versions and photo.
        integer(k, VERSIONS_COALESCE_MINUTES, 10, 1, 120, "Autosaves within this many minutes share one version row.");
        integer(k, VERSIONS_RETENTION_AUTO, 30, 5, 200, "Automatic version rows kept per resume.");
        integer(k, PHOTO_MAX_BYTES, 5242880, 1048576, 10485760, "Max profile photo upload in bytes.");
        k.add(
            json(
                PHOTO_DISCOURAGED_REGIONS,
                DEFAULT_DISCOURAGED_REGIONS,
                "Country codes where the photo prompt defaults to 'Keep photo off'.",
                n -> idList(n, 0, 100, s -> COUNTRY.matcher(s).matches())
            )
        );

        // Resume Score.
        k.add(
            new Key(
                SCORE_RULESET_VERSION,
                Type.ENUM,
                "v1",
                null,
                null,
                List.of("v1"),
                "Resume Score ruleset version.",
                null
            )
        );
        k.add(
            json(
                SCORE_GROUP_WEIGHTS,
                DEFAULT_GROUP_WEIGHTS,
                "Weight of each score group G1..G6 (integers 0-100).",
                n -> intMap(n, 0, 100, 1)
            )
        );
        k.add(
            json(SCORE_WEIGHTS, DEFAULT_RULE_WEIGHTS, "Weight of each score rule (integers 0-100).", n -> intMap(n, 0, 100, 1))
        );
        decimal(k, SCORE_PASS_THRESHOLD, "0.7", 0.5, 0.95, "A group passes when its fraction reaches this.");
        k.add(json(SCORE_BANDS, DEFAULT_SCORE_BANDS, "Score bands {min,title,body}: 2-6 bands, copy at most 80 characters.", ResumeBuilderSettingKeys::bands));

        // Job Match.
        k.add(
            json(
                MATCH_WEIGHTS,
                DEFAULT_MATCH_WEIGHTS,
                "Job match weights {skills,title,years,industry,education}; they sum to 100.",
                n -> exactKeys(n, Set.of("skills", "title", "years", "industry", "education")) && intMap(n, 0, 100, 5) && sum(n) == 100
            )
        );
        integer(k, MATCH_KEY_SKILLS_COUNT, 10, 5, 15, "Key skills extracted from a job description.");
        k.add(
            json(
                MATCH_THRESHOLDS,
                DEFAULT_MATCH_THRESHOLDS,
                "Checklist pass thresholds {keySkills,experience,industry}, each 0.3-0.9.",
                n -> {
                    if (!exactKeys(n, Set.of("keySkills", "experience", "industry"))) return false;
                    for (JsonNode v : n) if (!v.isNumber() || v.asDouble() < 0.3 || v.asDouble() > 0.9) return false;
                    return true;
                }
            )
        );
        integer(k, JOBMATCH_MIN_JD_CHARS, 200, 50, 1000, "Shortest job description accepted.");
        integer(k, JOBMATCH_MAX_JD_CHARS, 8000, 2000, 20000, "Longest job description accepted.");
        bool(k, JOBMATCH_EMBEDDINGS, false, "Embedding synonym stage for Job Match (needs I4.6).");

        // AI.
        integer(k, AI_SUGGEST_MAX, 5, 1, 8, "Max AI suggestion cards.");
        bool(k, AI_SUGGEST_AUTO_REFRESH, false, "Refresh AI suggestions automatically when the document changes.");
        integer(k, AI_SUGGEST_STALE_MINUTES, 10, 1, 120, "Minutes before suggestions are offered a manual refresh.");
        integer(k, AI_REWRITE_MAX_REFS, 12, 1, 20, "Max bullets sent to one Rewrite with AI call.");
        integer(k, AI_CAP_RESUME_DAILY, 40, 1, 500, "Daily cap on resume AI calls per user.");
        integer(k, AI_CAP_TAILOR_DAILY, 30, 1, 500, "Daily cap on Tailor to Job calls per user.");
        integer(k, AI_CAP_COVER_DAILY, 10, 1, 500, "Daily cap on cover letter calls per user.");
        integer(k, AI_CAP_FIT_DAILY, 60, 1, 500, "Daily cap on keyword placement calls per user.");

        // PDF (R0.6 limits and the R3.7 async pipeline).
        integer(k, PDF_TIMEOUT_MS, 20000, 5000, 60000, "Chromium render timeout.");
        integer(k, PDF_MAX_CONCURRENT, 1, 1, 4, "Concurrent PDF renders.");
        integer(k, PDF_QUEUE_MAX, 10, 1, 50, "Max queued PDF renders.");
        integer(k, PDF_MAX_FIT_STEPS, 3, 0, 7, "Max page-fit re-measure steps per export.");
        integer(k, PDF_WAIT_MS, 30000, 5000, 120000, "How long Save & Download waits for the async PDF.");
        integer(k, PDF_SETTLE_MS, 15000, 2000, 120000, "Quiet time after the last save before the PDF job runs.");
        integer(k, PDF_POLL_MS, 5000, 1000, 60000, "PDF worker poll interval.");
        integer(k, PDF_LEASE_MS, 120000, 30000, 600000, "PDF job lease length.");
        integer(k, PDF_BACKOFF_BASE_MS, 30000, 5000, 300000, "PDF retry backoff base.");
        integer(k, PDF_BACKOFF_MAX_MS, 900000, 60000, 3600000, "PDF retry backoff ceiling.");
        integer(k, PDF_MAX_ATTEMPTS, 5, 1, 10, "PDF attempts before FAILED.");
        integer(k, PDF_KEEP_PREVIOUS, 0, 0, 5, "Previous PDFs kept per resume (reserved).");
        bool(k, PDF_VIEW_AUTO_REFRESH, false, "Regenerate the PDF view automatically when the document changes.");
        integer(k, PDF_BUSY_RETRY_MS, 10000, 1000, 120000, "Wait before retrying a PDF job the renderer refused as busy (no attempt is counted).");
        integer(k, PDF_STATUS_POLL_MS, 5000, 1000, 60000, "How often the editor checks the PDF status while it is not ready.");
        integer(k, PDF_STATUS_WINDOW_MS, 180000, 30000, 900000, "How long after the last save the editor keeps checking the PDF status.");

        // Sharing, views, thumbnails, lists.
        bool(k, META_SHARE_WITH_ORG_DEFAULT, true, "New resumes are shared with the user's organisation by default.");
        integer(k, SHARE_MAX_GRANTS, 20, 1, 100, "Max share grants per resume.");
        integer(k, SHARE_MAX_LINKS, 3, 1, 10, "Max share links per resume.");
        integer(k, SHARE_LINK_DEFAULT_DAYS, 30, 0, 365, "Default share link lifetime in days (0 = no expiry).");
        bool(k, SHARE_ALLOW_DOWNLOAD_DEFAULT, false, "New share links allow download by default.");
        integer(k, VIEWS_RETENTION_DAYS, 180, 30, 730, "Days resume view events are kept.");
        integer(k, THUMB_WIDTH, 240, 120, 480, "Thumbnail width in pixels.");
        k.add(
            json(
                LIST_QUICK_TIPS,
                DEFAULT_QUICK_TIPS,
                "Quick Tips card lines on the list page: 1-6 lines of at most 90 characters.",
                n -> stringList(n, 1, 6, 90)
            )
        );
        integer(k, LIST_VIRTUALIZE_ABOVE, 60, 20, 500, "Virtualise the resume grid above this many cards.");
        integer(k, ORG_RESUMES_NEW_DAYS, 30, 7, 90, "Days a resume counts as new on the org page.");
        integer(k, ORG_RESUMES_PAGE_SIZE, 24, 12, 96, "Org Resumes & Profiles page size.");
        integer(k, ORG_RESUMES_MAX_SAVED_VIEWS, 10, 1, 30, "Saved views per org admin.");

        // Organizations: the production flag (declared default OFF; the property / env default for dev, CI and the demo is ON,
        // see OrgFeatureFlag) and the abuse caps on creating orgs and groups (422 ORG_LIMIT_REACHED when exceeded).
        bool(k, FEATURE_ORGS, false, "Organization features (/api/orgs/**, /org). OFF in production. When no value is stored here the dossier.orgs.enabled property decides (ORGS_ENABLED; on in dev, CI and the demo).");
        integer(k, ORG_LIMIT_CREATED_PER_USER, 3, 1, 100, "Organizations one person may create (closed ones count).");
        integer(k, ORG_LIMIT_GROUPS_PER_ORG, 50, 1, 500, "Groups (departments, cohorts, teams) per organization.");

        // Onboarding v2 (DESIGN 11). The existing profile.setup.promptBelowPercent above is the card's finished-user threshold.
        bool(k, FEATURE_ONBOARDING_V2, true, "Onboarding v2: the dashboard 'Finish your profile' card and the /welcome redirect (the flow itself is always on).");
        bool(k, ONBOARDING_PERSONA_ENABLED, true, "Ask 'which one's you?' first; off hides that step and the persona stays empty.");
        integer(k, ONBOARDING_ESTIMATE_MINUTES, 2, 1, 10, "The '~N min' estimate shown at the start of setup and on the dashboard card.");
        k.add(
            json(
                ONBOARDING_STEP_SECONDS,
                DEFAULT_ONBOARDING_STEP_SECONDS,
                "Seconds each setup step takes {hello, source, review, skills, you, prefs}, each 5-600; they drive 'about N min left'.",
                n -> exactKeys(n, ONBOARDING_STEP_KEYS) && intMap(n, 5, 600, ONBOARDING_STEP_KEYS.size())
            )
        );
        integer(k, ONBOARDING_DRAFT_TTL_DAYS, 30, 7, 365, "Days an unfinished setup draft is kept after its last save.");
        integer(k, ONBOARDING_DRAFT_MAX_BYTES, 262144, 65536, 1048576, "Max serialised size of one setup draft in bytes.");
        integer(k, ONBOARDING_RATE_DRAFT_PER_MIN, 60, 10, 600, "Setup draft saves per user per minute (BFF).");
        integer(k, ONBOARDING_CARD_SNOOZE_DAYS, 3, 1, 30, "Days 'Remind me in a few days' hides the dashboard card.");
        integer(k, ONBOARDING_CARD_RESURFACE_BELOW_PERCENT, 20, 0, 100, "A dismissed card comes back only while the profile is under this percent (0 = never).");
        integer(k, ONBOARDING_CARD_RESURFACE_AFTER_DAYS, 14, 1, 365, "Days after 'Don't show this again' before the card may come back.");
        integer(k, ONBOARDING_CARD_MAX_RESURFACES, 2, 0, 10, "How many times a dismissed card may come back.");
        bool(k, ONBOARDING_CONFETTI_ENABLED, true, "Confetti on the setup payoff screen.");
        bool(k, ONBOARDING_MASCOT_ENABLED, true, "The mascot on setup screens and the dashboard card.");
        k.add(
            json(
                ONBOARDING_PAYOFF_ACTIONS,
                DEFAULT_ONBOARDING_PAYOFF_ACTIONS,
                "Next actions on the payoff screen, in order: 1-3 of build_resume, install_extension, find_jobs.",
                n -> idList(n, 1, 3, ONBOARDING_PAYOFF_ACTION_IDS::contains)
            )
        );

        // Notifications (E2E-U7.0). Quiet hours are off by default; the window below is what switching them on offers.
        k.add(
            json(
                NOTIFY_DEFAULTS,
                DEFAULT_NOTIFY_MATRIX,
                "Per-kind notification defaults {KIND: {inapp: bool, email: off|now}} for users who have not set their own; kinds left out fall back to in-app on, email off. BILLING and SECURITY are always on.",
                ResumeBuilderSettingKeys::notifyMatrix
            )
        );
        bool(k, NOTIFY_EMAIL_ENABLED, true, "Notification emails (the kill switch: off sends none, in-app notices still appear).");
        bool(k, NOTIFY_QUIET_DEFAULT_ENABLED, false, "New users start with quiet hours on (emails held back during the window).");
        integer(k, NOTIFY_QUIET_START_HOUR, 22, 0, 23, "Local hour quiet hours start at when a user switches them on.");
        integer(k, NOTIFY_QUIET_END_HOUR, 8, 0, 23, "Local hour quiet hours end at when a user switches them on.");
        k.add(new Key(NOTIFY_DEFAULT_TZ, Type.STRING, "UTC", null, null, null, "IANA time zone assumed for users who have not set one.", null));

        // BFF rate limits.
        integer(k, RATE_DOC_WRITES_PER_MIN, 120, 10, 1000, "Document writes per user per minute.");
        integer(k, RATE_AI_PER_MIN, 20, 10, 1000, "AI calls per user per minute.");
        integer(k, RATE_EXPORT_PER_MIN, 10, 10, 1000, "Exports per user per minute.");
        integer(k, RATE_PUBLIC_PER_MIN, 60, 10, 1000, "Public share-link requests per IP per minute.");

        // Applications tracker (APP-E2E U6.x).
        integer(k, TRACKER_LIST_DEFAULT_SIZE, 20, 5, 50, "Applications per page when the request names no size.");
        integer(k, TRACKER_LIST_MAX_SIZE, 50, 10, 200, "Largest applications page the server returns; a bigger size is clamped to it.");
        integer(k, TRACKER_SEARCH_MAX_CHARS, 120, 20, 500, "Longest applications search text; longer is refused (400 QUERY_TOO_LONG).");
        integer(k, TRACKER_GHOSTED_AFTER_DAYS, 21, 7, 90, "An applied or in-review application with no event for this many days shows as ghosted (derived, never stored).");
        integer(k, TRACKER_DETAIL_EVENTS_MAX, 50, 10, 200, "Timeline events returned with one application's detail.");
        integer(k, TRACKER_ACTIVITY_DEFAULT_DAYS, 30, 7, 365, "Days of tracker activity the dashboard bars cover when the request names none.");
        integer(k, TRACKER_ACTIVITY_MAX_DAYS, 90, 7, 365, "Most days of tracker activity one request may ask for.");
        integer(k, TRACKER_BULK_MAX_IDS, 50, 5, 200, "Applications one bulk action may touch.");
        integer(k, TRACKER_NOTE_MAX_CHARS, 4000, 500, 20000, "Max characters in one application note.");
        integer(k, TRACKER_NOTES_MAX_PER_APPLICATION, 200, 10, 1000, "Max notes on one application.");
        integer(k, TRACKER_INTERVIEWS_MAX_PER_APPLICATION, 30, 5, 200, "Max interviews logged on one application.");
        integer(k, TRACKER_INTERVIEW_NOTES_MAX_CHARS, 4000, 500, 20000, "Max characters in an interview's notes.");
        integer(k, TRACKER_INTERVIEW_MAX_DURATION_HOURS, 24, 1, 72, "Longest interview (end minus start) the server accepts.");
        integer(k, TRACKER_INTERVIEW_DEFAULT_DURATION_MINUTES, 60, 15, 480, "Length of the calendar entry when an interview has no end time.");
        integer(k, TRACKER_INTERVIEWS_DEFAULT_RANGE_DAYS, 30, 1, 366, "Days ahead the interviews list covers when the request names no range.");
        integer(k, TRACKER_INTERVIEWS_MAX_RANGE_DAYS, 366, 7, 1830, "Widest window (days) one interviews-list request may span.");
        integer(k, TRACKER_INTERVIEWS_LIST_MAX, 200, 20, 1000, "Most interviews one list request returns.");

        Map<String, Key> by = new LinkedHashMap<>();
        for (Key key : k) {
            if (by.put(key.key(), key) != null) throw new IllegalStateException("duplicate setting key " + key.key());
        }
        ALL = Collections.unmodifiableList(k);
        BY_KEY = Collections.unmodifiableMap(by);
    }

    private ResumeBuilderSettingKeys() {}

    /** Every declared key, in declaration order. */
    public static List<Key> all() {
        return ALL;
    }

    /** The declaration for {@code key} (an alias resolves to its canonical key); null when unknown. */
    public static Key find(String key) {
        String canonical = canonical(key);
        Key found = BY_KEY.get(canonical);
        if (found != null) return found;
        Key ai = com.dossier.api.service.ai.AiSettingKeys.find(canonical);
        return ai != null ? ai : com.dossier.api.service.settings.AdminSettingKeys.find(canonical);
    }

    /** The declaration for {@code key}; unknown keys are a programming error. */
    public static Key require(String key) {
        Key found = find(key);
        if (found == null) throw new IllegalArgumentException("Unknown Resume Builder setting: " + key);
        return found;
    }

    /** The canonical name of {@code key} (itself unless it is a documented alias). */
    public static String canonical(String key) {
        return ALIASES.getOrDefault(key, key);
    }

    // ---- declaration helpers ------------------------------------------------

    private static void bool(List<Key> k, String key, boolean def, String description) {
        k.add(new Key(key, Type.BOOL, String.valueOf(def), null, null, null, description, null));
    }

    private static void integer(List<Key> k, String key, int def, int min, int max, String description) {
        k.add(new Key(key, Type.INT, String.valueOf(def), (double) min, (double) max, null, description, null));
    }

    private static void decimal(List<Key> k, String key, String def, double min, double max, String description) {
        k.add(new Key(key, Type.DECIMAL, def, min, max, null, description, null));
    }

    private static Key json(String key, String def, String description, Predicate<JsonNode> check) {
        return new Key(key, Type.JSON, def, null, null, null, description, check);
    }

    // ---- JSON shape rules ---------------------------------------------------

    private static List<String> knownTemplateIds() {
        return ResumeDocService.KNOWN_TEMPLATE_IDS.stream().sorted().toList();
    }

    private static boolean isKnownTemplate(String id) {
        return ResumeDocService.KNOWN_TEMPLATE_IDS.contains(id);
    }

    /** A JSON array of {@code min..max} distinct strings each accepted by {@code each}. */
    private static boolean idList(JsonNode n, int min, int max, Predicate<String> each) {
        if (!n.isArray() || n.size() < min || n.size() > max) return false;
        Set<String> seen = new java.util.HashSet<>();
        for (JsonNode e : n) {
            if (!e.isTextual() || !each.test(e.textValue()) || !seen.add(e.textValue())) return false;
        }
        return true;
    }

    private static boolean stringList(JsonNode n, int min, int max, int maxChars) {
        if (!n.isArray() || n.size() < min || n.size() > max) return false;
        for (JsonNode e : n) {
            if (!e.isTextual() || e.textValue().isBlank() || e.textValue().length() > maxChars) return false;
        }
        return true;
    }

    /** An object of identifier keys to integers in {@code lo..hi}, at least {@code minEntries} entries. */
    private static boolean intMap(JsonNode n, int lo, int hi, int minEntries) {
        if (!n.isObject() || n.size() < minEntries) return false;
        for (var it = n.fields(); it.hasNext();) {
            var e = it.next();
            if (!GROUP_OR_RULE_ID.matcher(e.getKey()).matches()) return false;
            if (!e.getValue().isIntegralNumber() || e.getValue().asInt() < lo || e.getValue().asInt() > hi) return false;
        }
        return true;
    }

    /** {KIND: {inapp: bool, email: off|now}}: every key a known notification kind, every value well shaped. */
    private static boolean notifyMatrix(JsonNode n) {
        if (!n.isObject()) return false;
        for (var it = n.fields(); it.hasNext();) {
            var e = it.next();
            if (com.dossier.api.domain.enumeration.NotificationKind.parse(e.getKey()).isEmpty()) return false;
            JsonNode v = e.getValue();
            if (!v.isObject() || !v.path("inapp").isBoolean()) return false;
            String email = v.path("email").asText("");
            if (!email.equals("off") && !email.equals("now")) return false;
        }
        return true;
    }

    private static boolean exactKeys(JsonNode n, Set<String> keys) {
        if (!n.isObject() || n.size() != keys.size()) return false;
        for (String key : keys) if (!n.has(key)) return false;
        return true;
    }

    private static int sum(JsonNode n) {
        int total = 0;
        for (JsonNode v : n) total += v.asInt();
        return total;
    }

    private static boolean bands(JsonNode n) {
        if (!n.isArray() || n.size() < 2 || n.size() > 6) return false;
        for (JsonNode b : n) {
            if (!b.isObject() || !b.path("min").isIntegralNumber() || b.path("min").asInt() < 0 || b.path("min").asInt() > 100) return false;
            for (String f : new String[] { "title", "body" }) {
                JsonNode t = b.path(f);
                if (!t.isTextual() || t.textValue().isBlank() || t.textValue().length() > 80) return false;
            }
        }
        return true;
    }
}
