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
        assertThat(settings.getJson(ResumeBuilderSettingKeys.TEMPLATES_ENABLED, String[].class)).containsExactly("modern");
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
        assertThat(settings.getJson(ResumeBuilderSettingKeys.TEMPLATES_ENABLED, String[].class)).containsExactly("modern");
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

    @Test
    void everyDeclaredDefaultIsItselfValid() {
        for (var key : ResumeBuilderSettingKeys.all()) {
            assertThat(ResumeBuilderSettings.isValid(key, key.defaultValue(), mapper)).as("default of %s", key.key()).isTrue();
            assertThat(key.description()).as("description of %s", key.key()).isNotBlank();
        }
        verify(repository, times(0)).save(any());
    }
}
