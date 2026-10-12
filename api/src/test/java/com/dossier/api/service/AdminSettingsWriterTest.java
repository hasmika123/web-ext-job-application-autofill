package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dossier.api.domain.AppSettingHistory;
import com.dossier.api.repository.AppSettingHistoryRepository;
import com.dossier.api.service.AdminSettingsWriter.Risk;
import com.dossier.api.service.AdminSettingsWriter.WriteResult;
import com.dossier.api.service.ai.FakeSettings;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.mockito.ArgumentCaptor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

/** The one runtime-settings write path (I1.9): validation codes, no-op, delete, history and audit rows. */
class AdminSettingsWriterTest {

    private FakeSettings fake;
    private AppSettingHistoryRepository history;
    private AdminAuditService audit;
    private AdminSettingsWriter writer;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("boss", "n/a"));
        fake = new FakeSettings();
        history = mock(AppSettingHistoryRepository.class);
        audit = mock(AdminAuditService.class);
        writer = new AdminSettingsWriter(fake.repository, history, audit, fake.settings, fake.mapper);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static void code(Runnable r, String code) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(AiConfigException.class, e -> assertThat(e.getCode()).isEqualTo(code));
    }

    @Test
    void anUnknownKeyIsRefused() {
        code(() -> writer.write("ai.route.nope.model", "x1", null, Risk.LOW), "AI_CONFIG_UNKNOWN_KEY");
        code(() -> writer.write("resume.nothing", "1", null, Risk.LOW), "AI_CONFIG_UNKNOWN_KEY");
    }

    @Test
    void outOfBoundsAndWrongTypeAreRefusedWithTheBounds() {
        assertThatThrownBy(() -> writer.write("ai.soft_cap_pct", "99", null, Risk.LOW))
            .isInstanceOfSatisfying(AiConfigException.class, e -> {
                assertThat(e.getCode()).isEqualTo("AI_CONFIG_OUT_OF_BOUNDS");
                assertThat(e.getStatus()).isEqualTo(400);
                assertThat(e.getExtra()).containsEntry("key", "ai.soft_cap_pct").containsEntry("min", 50d).containsEntry("max", 95d);
            });
        code(() -> writer.write("ai.soft_cap_pct", "lots", null, Risk.LOW), "AI_CONFIG_OUT_OF_BOUNDS");
        code(() -> writer.write("ai.enabled", "maybe", null, Risk.LOW), "AI_CONFIG_OUT_OF_BOUNDS");
        assertThatThrownBy(() -> writer.write("ai.route.map.fallback_provider", "claude", null, Risk.LOW))
            .isInstanceOfSatisfying(AiConfigException.class, e -> assertThat(e.getExtra()).containsKey("allowed"));
        assertThat(fake.rows).isEmpty();
    }

    @Test
    void modelAndUrlShapesHaveTheirOwnCodes() {
        code(() -> writer.write("ai.route.map.model", "has space", null, Risk.MEDIUM), "AI_MODEL_INVALID");
        code(() -> writer.write("ai.provider.gemini.base_url", "http://example.com", null, Risk.MEDIUM), "AI_URL_INVALID");
    }

    @Test
    void aHighRiskChangeNeedsAReason() {
        code(() -> writer.write("ai.enabled", "false", null, Risk.HIGH), "AI_CONFIG_REASON_REQUIRED");
        code(() -> writer.write("ai.enabled", "false", "   ", Risk.HIGH), "AI_CONFIG_REASON_REQUIRED");
        assertThat(fake.rows).isEmpty();
        verify(history, never()).save(any());
        verify(audit, never()).record(any(), any(), any(), any(), any());

        WriteResult ok = writer.write("ai.enabled", "false", "Gemini 5xx spike", Risk.HIGH);
        assertThat(ok.changed()).isTrue();
    }

    @Test
    void aWriteStoresTheRowHistoryAndAuditAndDropsTheCache() {
        fake.settings.stored("ai.route.map.model"); // load the cache
        WriteResult r = writer.write("ai.route.map.model", "gemini-2.5-flash", null, Risk.MEDIUM);

        assertThat(r.changed()).isTrue();
        assertThat(r.oldValue()).isNull();
        assertThat(fake.row("ai.route.map.model")).contains("gemini-2.5-flash");
        assertThat(fake.settings.stored("ai.route.map.model")).as("cache was invalidated").contains("gemini-2.5-flash");

        ArgumentCaptor<AppSettingHistory> h = ArgumentCaptor.forClass(AppSettingHistory.class);
        verify(history).save(h.capture());
        assertThat(h.getValue().getKey()).isEqualTo("ai.route.map.model");
        assertThat(h.getValue().getOldValue()).isNull();
        assertThat(h.getValue().getNewValue()).isEqualTo("gemini-2.5-flash");
        assertThat(h.getValue().getActorLogin()).isEqualTo("boss");

        verify(audit).record(
            eq(AdminAuditService.AI_CONFIG_CHANGE),
            eq(AdminAuditService.TARGET_AI_SETTING),
            eq("ai.route.map.model"),
            isNull(),
            eq("old=null new=gemini-2.5-flash")
        );
    }

    @Test
    void writingTheSameValueChangesNothing() {
        fake.put("ai.route.map.model", "gemini-2.5-flash");
        WriteResult r = writer.write("ai.route.map.model", "gemini-2.5-flash", "again", Risk.MEDIUM);
        assertThat(r.changed()).isFalse();
        verify(history, never()).save(any());
        verify(audit, never()).record(any(), any(), any(), any(), any());
        assertThat(writer.write("ai.route.map.fallback_model", null, null, Risk.MEDIUM).changed()).as("deleting a row that is not there").isFalse();
    }

    @Test
    void nullDeletesTheRowAndRecordsTheOldValue() {
        fake.put("ai.route.map.model", "gemini-2.5-flash");
        WriteResult r = writer.write("ai.route.map.model", null, "back to env", Risk.MEDIUM);
        assertThat(r.changed()).isTrue();
        assertThat(fake.row("ai.route.map.model")).isEmpty();

        ArgumentCaptor<AppSettingHistory> h = ArgumentCaptor.forClass(AppSettingHistory.class);
        verify(history).save(h.capture());
        assertThat(h.getValue().getOldValue()).isEqualTo("gemini-2.5-flash");
        assertThat(h.getValue().getNewValue()).isNull();
        assertThat(h.getValue().getReason()).isEqualTo("back to env");
        verify(audit).record(
            eq(AdminAuditService.AI_CONFIG_CHANGE),
            eq(AdminAuditService.TARGET_AI_SETTING),
            eq("ai.route.map.model"),
            eq("back to env"),
            eq("old=gemini-2.5-flash new=null")
        );
    }

    @Test
    void longValuesAreAbbreviatedInTheAuditDetails() {
        StringBuilder models = new StringBuilder("[");
        for (int i = 0; i < 30; i++) models.append(i == 0 ? "" : ",").append("\"model-number-").append(i).append("-padded\"");
        models.append("]");
        writer.write("ai.provider.gemini.models", models.toString(), null, Risk.LOW);
        ArgumentCaptor<String> details = ArgumentCaptor.forClass(String.class);
        verify(audit).record(any(), any(), any(), any(), details.capture());
        assertThat(details.getValue().length()).isLessThan(900);
    }

    @Test
    void theLegacyRewriteAliasWritesTheCanonicalKey() {
        writer.write("ai.output_tokens_max.rewrite", "2000", null, Risk.LOW);
        assertThat(fake.row("ai.route.rewrite.max_output_tokens")).contains("2000");
    }
}
