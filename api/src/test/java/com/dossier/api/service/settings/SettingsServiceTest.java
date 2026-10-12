package com.dossier.api.service.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dossier.api.repository.AppSettingHistoryRepository;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.AdminSettingsWriter;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ai.AiEnv;
import com.dossier.api.service.ai.AiPolicy;
import com.dossier.api.service.ai.AiRuntimeSettings;
import com.dossier.api.service.ai.AiRuntimeSettings.Resolved;
import com.dossier.api.service.ai.AiRuntimeSettings.Source;
import com.dossier.api.service.ai.FakeSettings;
import com.dossier.api.service.settings.SettingsService.SettingItem;
import com.dossier.api.service.settings.SettingsService.SettingsView;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/** Reads (row, then env, then code default), validation, the reason rule and the audited write path (A5.1). */
class SettingsServiceTest {

    private static final JsonNodeFactory JSON = JsonNodeFactory.instance;

    private FakeSettings fake;
    private AppSettingHistoryRepository history;
    private AdminAuditService audit;
    private MockEnvironment environment;
    private SettingsService service;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("boss", "n/a"));
        fake = new FakeSettings();
        history = mock(AppSettingHistoryRepository.class);
        audit = mock(AdminAuditService.class);
        environment = new MockEnvironment();
        AiRuntimeSettings runtime = fake.runtime(new AiEnv(true, "gemini", "", "gemini-2.5-flash-lite", 400, 4000), new AiPolicy());
        AdminSettingsWriter writer = new AdminSettingsWriter(fake.repository, history, audit, fake.settings, fake.mapper);
        service = new SettingsService(fake.settings, runtime, writer, fake.repository, history, environment, fake.mapper);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static void code(Runnable r, String code) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(SettingsException.class, e -> assertThat(e.getCode()).isEqualTo(code));
    }

    // ---- reads ----------------------------------------------------------------

    @Test
    void withNoRowAndNoEnvTheCodeDefaultApplies() {
        assertThat(service.getInt("tracker.list.defaultSize")).isEqualTo(20);
        Resolved<Object> r = service.resolve("tracker.list.defaultSize");
        assertThat(r.value()).isEqualTo(20);
        assertThat(r.source()).isEqualTo(Source.DEFAULT);
        assertThat(r.envDefault()).isNull();
        assertThat(r.codeDefault()).isEqualTo(20);
    }

    @Test
    void aValidRowBeatsTheCodeDefaultAndAnInvalidRowIsIgnored() {
        fake.put("tracker.list.defaultSize", "35");
        assertThat(service.getInt("tracker.list.defaultSize")).isEqualTo(35);
        assertThat(service.resolve("tracker.list.defaultSize").source()).isEqualTo(Source.DB);

        fake.put("tracker.list.defaultSize", "9999"); // out of bounds: ignored, WARNed once
        assertThat(service.getInt("tracker.list.defaultSize")).isEqualTo(20);
        assertThat(service.resolve("tracker.list.defaultSize").source()).isEqualTo(Source.DEFAULT);
    }

    @Test
    void anEnvPropertyBeatsTheCodeDefaultAndARowBeatsEnv() {
        environment.setProperty("dossier.inbox.retention-days", "200");
        assertThat(service.getInt("inbox.retention_days")).isEqualTo(200);
        Resolved<Object> env = service.resolve("inbox.retention_days");
        assertThat(env.source()).isEqualTo(Source.ENV);
        assertThat(env.value()).isEqualTo(200);
        assertThat(env.envDefault()).isEqualTo(200);
        assertThat(env.codeDefault()).isEqualTo(365);

        fake.put("inbox.retention_days", "90");
        Resolved<Object> row = service.resolve("inbox.retention_days");
        assertThat(row.value()).isEqualTo(90);
        assertThat(row.source()).isEqualTo(Source.DB);
        assertThat(row.envDefault()).as("what reset would give").isEqualTo(200);
    }

    @Test
    void anEnvValueOutsideTheBoundsIsIgnored() {
        environment.setProperty("dossier.inbox.retention-days", "5");
        assertThat(service.getInt("inbox.retention_days")).isEqualTo(365);
        assertThat(service.resolve("inbox.retention_days").source()).isEqualTo(Source.DEFAULT);
    }

    @Test
    void theErrorDigestEnvMapsADurationToMinutesAndFallsBackToTheAdminEmail() {
        environment.setProperty("dossier.ops.error-digest.interval", "30m");
        assertThat(service.getInt("ops.error_digest.interval_min")).isEqualTo(30);
        environment.setProperty("dossier.ops.error-digest.fallback-to", "boss@kiwiply.com");
        assertThat(service.getString("ops.error_digest.to")).isEqualTo("boss@kiwiply.com");
        environment.setProperty("dossier.ops.error-digest.to", "ops@kiwiply.com");
        assertThat(service.getString("ops.error_digest.to")).isEqualTo("ops@kiwiply.com");
    }

    @Test
    void aiKeysResolveThroughTheAiRuntimeSoTheTwoPagesAgree() {
        Resolved<Object> r = service.resolve("ai.route.parse.model");
        assertThat(r.value()).isEqualTo("gemini-2.5-flash-lite");
        assertThat(r.source()).isEqualTo(Source.ENV);
        fake.put("ai.route.parse.model", "gemini-3.5-flash");
        assertThat(service.resolve("ai.route.parse.model").value()).isEqualTo("gemini-3.5-flash");
        assertThat(service.resolve("ai.route.parse.model").source()).isEqualTo(Source.DB);
    }

    @Test
    void typedGettersRefuseTheWrongTypeAndAnUnknownKey() {
        assertThatThrownBy(() -> service.getBool("tracker.list.defaultSize")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.getInt("jobs.nope")).isInstanceOf(IllegalArgumentException.class);
        assertThat(service.getBool("feature.resume_builder.enabled")).isTrue();
        assertThat(service.getString("ext.min_version")).isEqualTo("0.0.0");
        assertThat(service.getJson("flag.autopilot", JsonNode.class).get("on").asBoolean()).isFalse();
    }

    // ---- the list -------------------------------------------------------------

    @Test
    void theListGroupsByAreaAndFilters() {
        SettingsView all = service.list(null, null);
        assertThat(all.items()).hasSizeGreaterThan(250);
        assertThat(all.areas()).extracting(a -> a.area()).contains("tracker", "jobs", "ratelimit", "ai");
        assertThat(all.areas().stream().filter(a -> a.area().equals("ratelimit")).findFirst().orElseThrow().highCount()).isEqualTo(7);

        SettingsView tracker = service.list("tracker", null);
        assertThat(tracker.items()).isNotEmpty().allMatch(i -> i.area().equals("tracker"));
        assertThat(tracker.areas()).as("the rail keeps every area").hasSizeGreaterThan(5);

        SettingsView hits = service.list(null, "RETENTION");
        assertThat(hits.items()).extracting(SettingItem::key).contains("inbox.retention_days");
        assertThat(hits.areas()).extracting(a -> a.area()).contains("inbox");
    }

    @Test
    void anItemCarriesValueSourceBoundsRiskAndTheLastReason() {
        SettingItem item = service.list("jobs", null).items().stream().filter(i -> i.key().equals("jobs.match_threshold")).findFirst().orElseThrow();
        assertThat(item.type()).isEqualTo("INT");
        assertThat(item.risk()).isEqualTo("MEDIUM");
        assertThat(item.reasonRule()).isEqualTo("optional");
        assertThat(item.value()).isEqualTo(60);
        assertThat(item.source()).isEqualTo(Source.DEFAULT);
        assertThat(item.min()).isEqualTo(40L);
        assertThat(item.max()).isEqualTo(90L);
        assertThat(item.updatedBy()).isNull();
        SettingItem flag = service.get("flag.autopilot");
        assertThat(flag.type()).isEqualTo("FLAG");
        assertThat(flag.value()).isInstanceOf(JsonNode.class);
        assertThat(service.get("feature.resume_builder.enabled").reasonRule()).isEqualTo("when_off");
    }

    // ---- writes ---------------------------------------------------------------

    @Test
    void aSetStoresTheRowAndTheNextReadSeesIt() {
        SettingItem item = service.set("jobs.match_threshold", JSON.numberNode(70), null);
        assertThat(fake.row("jobs.match_threshold")).contains("70");
        assertThat(item.value()).isEqualTo(70);
        assertThat(item.source()).isEqualTo(Source.DB);
        assertThat(item.updatedBy()).isEqualTo("boss");
        assertThat(service.getInt("jobs.match_threshold")).isEqualTo(70);
        verify(audit).record(
            org.mockito.ArgumentMatchers.eq("SETTING_CHANGE"),
            org.mockito.ArgumentMatchers.eq("SETTING"),
            org.mockito.ArgumentMatchers.eq("jobs.match_threshold"),
            org.mockito.ArgumentMatchers.isNull(),
            org.mockito.ArgumentMatchers.contains("area=jobs risk=MEDIUM old=null new=70")
        );
    }

    @Test
    void aResetDeletesTheRowSoTheKeyFallsBack() {
        service.set("jobs.match_threshold", JSON.numberNode(70), null);
        SettingItem item = service.reset("jobs.match_threshold", null);
        assertThat(fake.row("jobs.match_threshold")).isEmpty();
        assertThat(item.source()).isEqualTo(Source.DEFAULT);
        assertThat(item.value()).isEqualTo(60);
    }

    @Test
    void unknownKeysAndBadValuesAreRefusedWithTheirCodes() {
        code(() -> service.set("jobs.nope", JSON.numberNode(1), null), "SETTING_UNKNOWN_KEY");
        code(() -> service.reset("nope", null), "SETTING_UNKNOWN_KEY");
        code(() -> service.get("nope"), "SETTING_UNKNOWN_KEY");
        code(() -> service.history("nope", null), "SETTING_UNKNOWN_KEY");
        assertThatThrownBy(() -> service.set("jobs.match_threshold", JSON.numberNode(99), null)).isInstanceOfSatisfying(SettingsException.class, e -> {
            assertThat(e.getCode()).isEqualTo("SETTING_OUT_OF_BOUNDS");
            assertThat(e.getStatus()).isEqualTo(400);
            assertThat(e.getExtra()).containsEntry("key", "jobs.match_threshold").containsEntry("min", 40L).containsEntry("max", 90L);
        });
        code(() -> service.set("jobs.match_threshold", JSON.textNode("lots"), null), "SETTING_OUT_OF_BOUNDS");
        code(() -> service.set("jobs.match_threshold", JSON.booleanNode(true), null), "SETTING_OUT_OF_BOUNDS");
        code(() -> service.set("jobs.match_threshold", JSON.numberNode(60.5), null), "SETTING_OUT_OF_BOUNDS");
        code(() -> service.set("jobs.match_threshold", JSON.nullNode(), null), "SETTING_OUT_OF_BOUNDS");
        code(() -> service.set("jobs.match_threshold", null, null), "SETTING_OUT_OF_BOUNDS");
        code(() -> service.set("ext.min_version", JSON.textNode("soon"), "pin the version low"), "SETTING_OUT_OF_BOUNDS");
        code(() -> service.set("catalog.margin_floor_subscription_pct", JSON.numberNode(79), "x".repeat(20)), "SETTING_OUT_OF_BOUNDS");
        code(() -> service.set("ai.route.map.model", JSON.textNode("has space"), null), "SETTING_OUT_OF_BOUNDS");
        code(() -> service.set("flag.autopilot", JSON.objectNode().put("pct", 5), null), "SETTING_OUT_OF_BOUNDS");
        assertThat(fake.rows).isEmpty();
        verify(audit, never()).record(any(), any(), any(), any(), any());
    }

    @Test
    void aHighRiskChangeNeedsAReasonOfTenCharacters() {
        code(() -> service.set("inbox.retention_days", JSON.numberNode(90), null), "SETTING_REASON_REQUIRED");
        code(() -> service.set("inbox.retention_days", JSON.numberNode(90), "   "), "SETTING_REASON_REQUIRED");
        code(() -> service.set("inbox.retention_days", JSON.numberNode(90), "short"), "SETTING_REASON_REQUIRED");
        assertThat(fake.rows).isEmpty();
        service.set("inbox.retention_days", JSON.numberNode(90), "GDPR review says 90 days");
        assertThat(fake.row("inbox.retention_days")).contains("90");
    }

    @Test
    void aKillSwitchNeedsAReasonOnlyToTurnItOff() {
        code(() -> service.set("feature.resume_builder.enabled", JSON.booleanNode(false), null), "SETTING_REASON_REQUIRED");
        assertThat(fake.rows).isEmpty();
        service.set("feature.resume_builder.enabled", JSON.booleanNode(false), "builder paused for a hotfix");
        assertThat(fake.row("feature.resume_builder.enabled")).contains("false");
        // turning it back on, or resetting to the default (on), needs none
        service.set("feature.resume_builder.enabled", JSON.booleanNode(true), null);
        service.set("feature.resume_builder.enabled", JSON.booleanNode(false), "paused again for a hotfix");
        service.reset("feature.resume_builder.enabled", null);
        assertThat(fake.row("feature.resume_builder.enabled")).isEmpty();
    }

    @Test
    void resettingAHighKeyToAHighDefaultNeedsAReason() {
        service.set("ext.ats.workday.enabled", JSON.booleanNode(false), "workday markup changed");
        // default is true: not high when the effective value is on
        service.reset("ext.ats.workday.enabled", null);
        service.set("inbox.retention_days", JSON.numberNode(90), "GDPR review says 90 days");
        code(() -> service.reset("inbox.retention_days", null), "SETTING_REASON_REQUIRED");
        service.reset("inbox.retention_days", "back to the standard window");
        assertThat(fake.row("inbox.retention_days")).isEmpty();
    }

    @Test
    void jsonAndStringValuesAreStoredAsText() {
        JsonNode flag = JSON.objectNode().put("on", true).put("pct", 20);
        service.set("flag.autopilot", flag, null);
        assertThat(fake.row("flag.autopilot").orElseThrow()).contains("\"pct\":20");
        service.set("ext.min_version", JSON.textNode("1.4.2"), "old builds break Workday");
        assertThat(service.getString("ext.min_version")).isEqualTo("1.4.2");
        service.set("ai.route.map.model", JSON.textNode("gemini-3.5-flash"), null);
        assertThat(fake.row("ai.route.map.model")).contains("gemini-3.5-flash");
    }

    @Test
    void anAliasWritesTheCanonicalKey() {
        service.set("resume.photo.enabled", JSON.booleanNode(false), "photos paused while we fix upload");
        assertThat(fake.row(ResumeBuilderSettingKeys.FEATURE_PHOTO)).contains("false");
        assertThat(service.get("resume.photo.enabled").key()).isEqualTo(ResumeBuilderSettingKeys.FEATURE_PHOTO);
    }
}
