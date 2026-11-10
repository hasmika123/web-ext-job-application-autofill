package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.repository.AppSettingRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

/**
 * {@link ResumeBuilderSettings}: declared defaults, the bounds fallback (with a single WARN), the
 * 60 s cache and its invalidation, and JSON parse errors falling back to the default.
 */
class ResumeBuilderSettingsTest {

    /** A clock the test can move. */
    private static final class MutableClock extends Clock {

        private Instant now = Instant.parse("2026-10-12T10:00:00Z");

        void advanceSeconds(long s) {
            now = now.plusSeconds(s);
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private final ObjectMapper mapper = new ObjectMapper();
    private final MutableClock clock = new MutableClock();
    private final List<AppSetting> rows = new ArrayList<>();
    private AppSettingRepository repository;
    private ResumeBuilderSettings settings;
    private ListAppender<ILoggingEvent> logs;
    private Logger logger;

    @BeforeEach
    void setUp() {
        repository = mock(AppSettingRepository.class);
        when(repository.findAll()).thenAnswer(inv -> new ArrayList<>(rows));
        settings = new ResumeBuilderSettings(repository, mapper, clock);
        logger = (Logger) LoggerFactory.getLogger(ResumeBuilderSettings.class);
        logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void tearDown() {
        logger.detachAppender(logs);
    }

    private void put(String key, String value) {
        rows.removeIf(r -> r.getKey().equals(key));
        rows.add(new AppSetting(key, value, "test", Instant.now()));
    }

    private long warnings() {
        return logs.list.stream().filter(e -> e.getLevel() == Level.WARN).count();
    }

    @Test
    void emptyTableYieldsTheDeclaredDefaults() {
        assertThat(settings.getBool(ResumeBuilderSettingKeys.FEATURE_BUILDER)).isTrue();
        assertThat(settings.getBool(ResumeBuilderSettingKeys.FEATURE_DOCX)).isFalse();
        assertThat(settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_SECTIONS)).isEqualTo(20);
        assertThat(settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_DOC_BYTES)).isEqualTo(262144);
        assertThat(settings.getDecimal(ResumeBuilderSettingKeys.SCORE_PASS_THRESHOLD)).isEqualTo(0.7);
        assertThat(settings.getString(ResumeBuilderSettingKeys.TEMPLATES_DEFAULT)).isEqualTo("modern");
        assertThat(settings.getString(ResumeBuilderSettingKeys.SCORE_RULESET_VERSION)).isEqualTo("v1");
        assertThat(settings.getJson(ResumeBuilderSettingKeys.TEMPLATES_ENABLED, String[].class)).startsWith("modern"); // grows one id per template story
        assertThat(settings.getJson(ResumeBuilderSettingKeys.SCORE_GROUP_WEIGHTS, JsonNode.class).path("G2").asInt()).isEqualTo(25);
        assertThat(warnings()).isZero();
    }

    @Test
    void validDatabaseValuesOverrideTheDefaults() {
        put(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS, "55");
        put(ResumeBuilderSettingKeys.PROFILE_ITEMS_MAX_PER_USER, "800");
        put(ResumeBuilderSettingKeys.SCORE_PASS_THRESHOLD, "0.8");
        put(ResumeBuilderSettingKeys.FEATURE_DOCX, "true");
        put(ResumeBuilderSettingKeys.TEMPLATES_ENABLED, "[\"modern\",\"classic\"]");
        assertThat(settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS)).isEqualTo(55);
        assertThat(settings.getInt(ResumeBuilderSettingKeys.PROFILE_ITEMS_MAX_PER_USER)).isEqualTo(800);
        assertThat(settings.getDecimal(ResumeBuilderSettingKeys.SCORE_PASS_THRESHOLD)).isEqualTo(0.8);
        assertThat(settings.getBool(ResumeBuilderSettingKeys.FEATURE_DOCX)).isTrue();
        assertThat(settings.getJson(ResumeBuilderSettingKeys.TEMPLATES_ENABLED, String[].class)).containsExactly("modern", "classic");
        assertThat(warnings()).isZero();
    }

    @Test
    void outOfBoundsAndUnparsableValuesFallBackToTheDefaultAndWarnOnce() {
        put(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS, "101"); // max 100
        put(ResumeBuilderSettingKeys.DOC_LIMIT_SECTIONS, "lots");
        put(ResumeBuilderSettingKeys.SCORE_PASS_THRESHOLD, "0.99"); // max 0.95
        put(ResumeBuilderSettingKeys.FEATURE_DOCX, "yes");
        put(ResumeBuilderSettingKeys.TEMPLATES_DEFAULT, "fancy"); // not a registered id
        put(ResumeBuilderSettingKeys.SCORE_RULESET_VERSION, "v9");

        for (int i = 0; i < 3; i++) {
            assertThat(settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS)).isEqualTo(40);
            assertThat(settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_SECTIONS)).isEqualTo(20);
            assertThat(settings.getDecimal(ResumeBuilderSettingKeys.SCORE_PASS_THRESHOLD)).isEqualTo(0.7);
            assertThat(settings.getBool(ResumeBuilderSettingKeys.FEATURE_DOCX)).isFalse();
            assertThat(settings.getString(ResumeBuilderSettingKeys.TEMPLATES_DEFAULT)).isEqualTo("modern");
            assertThat(settings.getString(ResumeBuilderSettingKeys.SCORE_RULESET_VERSION)).isEqualTo("v1");
        }
        assertThat(warnings()).as("one WARN per bad value, not per read").isEqualTo(6);
    }

    @Test
    void jsonParseErrorsAndShapeViolationsFallBackToTheDefault() {
        put(ResumeBuilderSettingKeys.THEME_ACCENT_PALETTE, "[\"#16a34a\", "); // not JSON
        put(ResumeBuilderSettingKeys.SCORE_GROUP_WEIGHTS, "{\"G1\":150}"); // over 100
        put(ResumeBuilderSettingKeys.MATCH_WEIGHTS, "{\"skills\":50,\"title\":15,\"years\":10,\"industry\":15,\"education\":20}"); // sums to 110
        put(ResumeBuilderSettingKeys.TEMPLATES_ENABLED, "[\"nope\"]");
        assertThat(settings.getJson(ResumeBuilderSettingKeys.THEME_ACCENT_PALETTE, String[].class)).hasSize(6);
        assertThat(settings.getJson(ResumeBuilderSettingKeys.SCORE_GROUP_WEIGHTS, JsonNode.class).path("G1").asInt()).isEqualTo(15);
        assertThat(settings.getJson(ResumeBuilderSettingKeys.MATCH_WEIGHTS, JsonNode.class).path("education").asInt()).isEqualTo(10);
        assertThat(settings.getJson(ResumeBuilderSettingKeys.TEMPLATES_ENABLED, String[].class)).startsWith("modern"); // the default list
        assertThat(warnings()).isEqualTo(4);
    }

    @Test
    void theWholeTableIsCachedForSixtySecondsAndInvalidateBumpsIt() {
        put(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS, "50");
        assertThat(settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS)).isEqualTo(50);
        settings.getBool(ResumeBuilderSettingKeys.FEATURE_DOCX);
        verify(repository, times(1)).findAll(); // one query serves every getter

        put(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS, "60");
        clock.advanceSeconds(59);
        assertThat(settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS)).as("still cached").isEqualTo(50);

        clock.advanceSeconds(1);
        assertThat(settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS)).as("expired").isEqualTo(60);
        verify(repository, times(2)).findAll();

        put(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS, "70");
        settings.invalidate();
        assertThat(settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS)).as("invalidated by a write").isEqualTo(70);
    }

    @Test
    void anAliasReadsAndWritesTheCanonicalKey() {
        put("builder.version_retention_auto", "45");
        assertThat(settings.getInt("builder.version_retention_auto")).isEqualTo(45);
        assertThat(settings.getInt(ResumeBuilderSettingKeys.VERSIONS_RETENTION_AUTO)).isEqualTo(45);
        put("resume.photo.enabled", "false");
        settings.invalidate();
        assertThat(settings.getBool(ResumeBuilderSettingKeys.FEATURE_PHOTO)).isFalse();
    }

    @Test
    void unknownKeysAndWrongTypesAreProgrammingErrors() {
        assertThatThrownBy(() -> settings.getInt("resume.no.such.key")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> settings.getBool(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> settings.getString(ResumeBuilderSettingKeys.THEME_ACCENT_PALETTE)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> settings.getJson(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS, JsonNode.class)).isInstanceOf(IllegalArgumentException.class);
    }

    // ---- Onboarding v2 keys (R1.8) -------------------------------------------

    private static final String[][] ONBOARDING_INTS = {
        // key, default, min, max
        { ResumeBuilderSettingKeys.ONBOARDING_ESTIMATE_MINUTES, "2", "1", "10" },
        { ResumeBuilderSettingKeys.ONBOARDING_DRAFT_TTL_DAYS, "30", "7", "365" },
        { ResumeBuilderSettingKeys.ONBOARDING_DRAFT_MAX_BYTES, "262144", "65536", "1048576" },
        { ResumeBuilderSettingKeys.ONBOARDING_RATE_DRAFT_PER_MIN, "60", "10", "600" },
        { ResumeBuilderSettingKeys.ONBOARDING_CARD_SNOOZE_DAYS, "3", "1", "30" },
        { ResumeBuilderSettingKeys.ONBOARDING_CARD_RESURFACE_BELOW_PERCENT, "20", "0", "100" },
        { ResumeBuilderSettingKeys.ONBOARDING_CARD_RESURFACE_AFTER_DAYS, "14", "1", "365" },
        { ResumeBuilderSettingKeys.ONBOARDING_CARD_MAX_RESURFACES, "2", "0", "10" },
    };

    @Test
    void onboardingDefaultsAreTheDesignOnes() {
        assertThat(settings.getBool(ResumeBuilderSettingKeys.FEATURE_ONBOARDING_V2)).isTrue();
        assertThat(settings.getBool(ResumeBuilderSettingKeys.ONBOARDING_PERSONA_ENABLED)).isTrue();
        assertThat(settings.getBool(ResumeBuilderSettingKeys.ONBOARDING_CONFETTI_ENABLED)).isTrue();
        assertThat(settings.getBool(ResumeBuilderSettingKeys.ONBOARDING_MASCOT_ENABLED)).isTrue();
        for (String[] k : ONBOARDING_INTS) assertThat(settings.getInt(k[0])).as(k[0]).isEqualTo(Integer.parseInt(k[1]));
        JsonNode steps = settings.getJson(ResumeBuilderSettingKeys.ONBOARDING_STEP_SECONDS, JsonNode.class);
        assertThat(steps.path("hello").asInt()).isEqualTo(10);
        assertThat(steps.path("source").asInt()).isEqualTo(40);
        assertThat(steps.path("review").asInt()).isEqualTo(45);
        assertThat(steps.path("skills").asInt()).isEqualTo(20);
        assertThat(steps.path("you").asInt()).isEqualTo(15);
        assertThat(steps.path("prefs").asInt()).isEqualTo(30);
        assertThat(settings.getJson(ResumeBuilderSettingKeys.ONBOARDING_PAYOFF_ACTIONS, String[].class))
            .containsExactly("build_resume", "install_extension", "find_jobs");
        assertThat(warnings()).isZero();
    }

    @Test
    void everyOnboardingIntegerAcceptsItsBoundsAndFallsBackOutsideThem() {
        for (String[] k : ONBOARDING_INTS) {
            int def = Integer.parseInt(k[1]);
            int min = Integer.parseInt(k[2]);
            int max = Integer.parseInt(k[3]);
            put(k[0], String.valueOf(min));
            settings.invalidate();
            assertThat(settings.getInt(k[0])).as(k[0] + " at min").isEqualTo(min);
            put(k[0], String.valueOf(max));
            settings.invalidate();
            assertThat(settings.getInt(k[0])).as(k[0] + " at max").isEqualTo(max);
            for (int bad : new int[] { min - 1, max + 1 }) {
                put(k[0], String.valueOf(bad));
                settings.invalidate();
                assertThat(settings.getInt(k[0])).as(k[0] + " at " + bad).isEqualTo(def);
            }
            put(k[0], "many");
            settings.invalidate();
            assertThat(settings.getInt(k[0])).as(k[0] + " unparsable").isEqualTo(def);
        }
    }

    @Test
    void onboardingStepSecondsNeedsAllSixStepsWithinBounds() {
        String ok = "{\"hello\":5,\"source\":600,\"review\":45,\"skills\":20,\"you\":15,\"prefs\":30}";
        put(ResumeBuilderSettingKeys.ONBOARDING_STEP_SECONDS, ok);
        settings.invalidate();
        assertThat(settings.getJson(ResumeBuilderSettingKeys.ONBOARDING_STEP_SECONDS, JsonNode.class).path("source").asInt()).isEqualTo(600);

        for (String bad : List.of(
            "{\"hello\":4,\"source\":40,\"review\":45,\"skills\":20,\"you\":15,\"prefs\":30}",
            "{\"hello\":10,\"source\":601,\"review\":45,\"skills\":20,\"you\":15,\"prefs\":30}",
            "{\"hello\":10,\"source\":40,\"review\":45,\"skills\":20,\"you\":15}",
            "{\"hello\":10,\"source\":40,\"review\":45,\"skills\":20,\"you\":15,\"prefs\":30,\"done\":9}",
            "{\"hello\":\"10\",\"source\":40,\"review\":45,\"skills\":20,\"you\":15,\"prefs\":30}",
            "[10,40,45,20,15,30]"
        )) {
            put(ResumeBuilderSettingKeys.ONBOARDING_STEP_SECONDS, bad);
            settings.invalidate();
            assertThat(settings.getJson(ResumeBuilderSettingKeys.ONBOARDING_STEP_SECONDS, JsonNode.class).path("hello").asInt()).as(bad).isEqualTo(10);
        }
    }

    @Test
    void onboardingPayoffActionsAreAnOrderedSubsetOfOneToThree() {
        put(ResumeBuilderSettingKeys.ONBOARDING_PAYOFF_ACTIONS, "[\"find_jobs\",\"build_resume\"]");
        settings.invalidate();
        assertThat(settings.getJson(ResumeBuilderSettingKeys.ONBOARDING_PAYOFF_ACTIONS, String[].class)).containsExactly("find_jobs", "build_resume");

        put(ResumeBuilderSettingKeys.ONBOARDING_PAYOFF_ACTIONS, "[\"find_jobs\"]");
        settings.invalidate();
        assertThat(settings.getJson(ResumeBuilderSettingKeys.ONBOARDING_PAYOFF_ACTIONS, String[].class)).containsExactly("find_jobs");

        for (String bad : List.of("[]", "[\"nope\"]", "[\"find_jobs\",\"find_jobs\"]", "[\"build_resume\",\"install_extension\",\"find_jobs\",\"find_jobs\"]", "\"find_jobs\"")) {
            put(ResumeBuilderSettingKeys.ONBOARDING_PAYOFF_ACTIONS, bad);
            settings.invalidate();
            assertThat(settings.getJson(ResumeBuilderSettingKeys.ONBOARDING_PAYOFF_ACTIONS, String[].class)).as(bad).hasSize(3);
        }
    }

    // ---- Onboarding delight layer (R1.14) ---------------------------------------

    @Test
    void delightDefaultsAreTheDesignOnes() {
        for (String on : List.of(
            ResumeBuilderSettingKeys.ONBOARDING_DELIGHT_ENABLED,
            ResumeBuilderSettingKeys.ONBOARDING_DELIGHT_HAPTICS,
            ResumeBuilderSettingKeys.ONBOARDING_DELIGHT_COMBO,
            ResumeBuilderSettingKeys.ONBOARDING_DELIGHT_HIGHLIGHTS,
            ResumeBuilderSettingKeys.ONBOARDING_DELIGHT_MILESTONES,
            ResumeBuilderSettingKeys.ONBOARDING_DELIGHT_SHARE
        )) assertThat(settings.getBool(on)).as(on).isTrue();
        assertThat(settings.getBool(ResumeBuilderSettingKeys.ONBOARDING_DELIGHT_BAR_RIDER)).as("the rider is off by default").isFalse();
        assertThat(settings.getInt(ResumeBuilderSettingKeys.ONBOARDING_DELIGHT_INTERSTITIAL_MS)).isEqualTo(1200);
        assertThat(settings.getJson(ResumeBuilderSettingKeys.ONBOARDING_DELIGHT_INTERSTITIALS, String[].class)).containsExactly("review");
        assertThat(settings.getJson(ResumeBuilderSettingKeys.ONBOARDING_DELIGHT_COPY, JsonNode.class).size()).isZero();
        assertThat(warnings()).isZero();
    }

    @Test
    void delightInterstitialMsAcceptsZeroAndThreeThousandAndFallsBackOutside() {
        String key = ResumeBuilderSettingKeys.ONBOARDING_DELIGHT_INTERSTITIAL_MS;
        for (int ok : new int[] { 0, 3000 }) {
            put(key, String.valueOf(ok));
            settings.invalidate();
            assertThat(settings.getInt(key)).as("at " + ok).isEqualTo(ok);
        }
        for (int bad : new int[] { -1, 3001 }) {
            put(key, String.valueOf(bad));
            settings.invalidate();
            assertThat(settings.getInt(key)).as("out of bounds " + bad).isEqualTo(1200);
        }
        assertThat(warnings()).isPositive();
    }

    @Test
    void delightInterstitialsAreASubsetOfReviewAndPrefs() {
        String key = ResumeBuilderSettingKeys.ONBOARDING_DELIGHT_INTERSTITIALS;
        put(key, "[\"prefs\",\"review\"]");
        settings.invalidate();
        assertThat(settings.getJson(key, String[].class)).containsExactly("prefs", "review");
        put(key, "[]");
        settings.invalidate();
        assertThat(settings.getJson(key, String[].class)).as("none is allowed").isEmpty();
        for (String bad : List.of("[\"hello\"]", "[\"review\",\"review\"]", "\"review\"", "[\"review\",\"prefs\",\"review\"]")) {
            put(key, bad);
            settings.invalidate();
            assertThat(settings.getJson(key, String[].class)).as(bad).containsExactly("review");
        }
    }

    @Test
    void delightCopyOverridesAreKeyedStringsOrLists() {
        String key = ResumeBuilderSettingKeys.ONBOARDING_DELIGHT_COPY;
        put(key, "{\"review.keep\":[\"Nice.\",\"Yep.\"],\"hello.idle\":\"Hi!\"}");
        settings.invalidate();
        JsonNode copy = settings.getJson(key, JsonNode.class);
        assertThat(copy.path("hello.idle").asText()).isEqualTo("Hi!");
        assertThat(copy.path("review.keep").size()).isEqualTo(2);
        for (String bad : List.of(
            "[\"x\"]",
            "{\"Review Keep\":\"x\"}",
            "{\"review.keep\":\"\"}",
            "{\"review.keep\":[]}",
            "{\"review.keep\":[1]}",
            "{\"review.keep\":42}",
            "{\"hello.idle\":\"" + "x".repeat(201) + "\"}"
        )) {
            put(key, bad);
            settings.invalidate();
            assertThat(settings.getJson(key, JsonNode.class).size()).as(bad).isZero();
        }
    }

    @Test
    void onboardingSwitchesParseAsBooleans() {
        put(ResumeBuilderSettingKeys.FEATURE_ONBOARDING_V2, "false");
        put(ResumeBuilderSettingKeys.ONBOARDING_CONFETTI_ENABLED, "yes");
        settings.invalidate();
        assertThat(settings.getBool(ResumeBuilderSettingKeys.FEATURE_ONBOARDING_V2)).isFalse();
        assertThat(settings.getBool(ResumeBuilderSettingKeys.ONBOARDING_CONFETTI_ENABLED)).as("not a boolean: default").isTrue();
    }

    @Test
    void everyDeclaredDefaultIsItselfValid() {
        for (var key : ResumeBuilderSettingKeys.all()) {
            assertThat(ResumeBuilderSettings.isValid(key, key.defaultValue(), mapper)).as("default of %s", key.key()).isTrue();
            assertThat(key.description()).as("description of %s", key.key()).isNotBlank();
        }
        verify(repository, times(0)).save(any());
    }
}
