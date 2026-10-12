package com.dossier.api.service;

import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.AppSettingHistory;
import com.dossier.api.repository.AppSettingHistoryRepository;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.dossier.api.service.ai.AiSettingKeys;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one write path for runtime settings (AI-ADMIN-CONFIG-DESIGN 3.4; the generic write path A5.1 will
 * expose). In ONE transaction (the caller's, so a refused request leaves nothing behind) it validates the
 * value against the key's declared type and bounds, writes {@code app_setting}, appends
 * {@code app_setting_history}, records an {@code AI_CONFIG_CHANGE} audit row, and drops the settings cache so
 * the change applies on the next read, without a restart.
 *
 * <p>Writing the value a key already has changes nothing and writes no history or audit row. A null value
 * deletes the row (the key falls back to env/default).
 */
@Service
public class AdminSettingsWriter {

    /** How dangerous a change is: HIGH needs a reason (and, from A0.5, a re-authentication). */
    public enum Risk {
        LOW,
        MEDIUM,
        HIGH,
    }

    /** What a write did: {@code changed} false = the value was already that (no-op). */
    public record WriteResult(boolean changed, String oldValue, String newValue) {}

    private static final int DETAIL_VALUE_MAX = 400;

    private final AppSettingRepository repository;
    private final AppSettingHistoryRepository history;
    private final AdminAuditService audit;
    private final ResumeBuilderSettings settings;
    private final ObjectMapper mapper;

    public AdminSettingsWriter(
        AppSettingRepository repository,
        AppSettingHistoryRepository history,
        AdminAuditService audit,
        ResumeBuilderSettings settings,
        ObjectMapper mapper
    ) {
        this.repository = repository;
        this.history = history;
        this.audit = audit;
        this.settings = settings;
        this.mapper = mapper;
    }

    /**
     * @param key           a declared setting (an alias resolves to its canonical key)
     * @param newValueOrNull the new value, or null to delete the row (back to env/default)
     * @param reason        why; required when {@code risk} is HIGH
     */
    @Transactional
    public WriteResult write(String key, String newValueOrNull, String reason, Risk risk) {
        Key k = ResumeBuilderSettingKeys.find(key);
        if (k == null) throw AiConfigException.unknownKey(key);
        String newValue = newValueOrNull == null ? null : newValueOrNull.trim();
        if (newValue != null) {
            String shape = AiSettingKeys.shapeError(k, newValue);
            if (AiSettingKeys.CODE_MODEL_INVALID.equals(shape)) throw AiConfigException.modelInvalid(newValue);
            if (AiSettingKeys.CODE_URL_INVALID.equals(shape)) throw AiConfigException.urlInvalid();
            if (!ResumeBuilderSettings.isValid(k, newValue, mapper)) throw AiConfigException.outOfBounds(k.key(), k.min(), k.max(), k.allowed());
        }
        String cleanReason = reason == null || reason.isBlank() ? null : abbreviate(reason.trim(), 500);
        if (risk == Risk.HIGH && cleanReason == null) throw AiConfigException.reasonRequired(k.key());

        String old = repository.findById(k.key()).map(AppSetting::getValue).orElse(null);
        if (Objects.equals(old, newValue)) return new WriteResult(false, old, newValue);

        String actor = SecurityUtils.getCurrentUserLogin().orElse("system");
        Instant now = Instant.now();
        if (newValue == null) {
            repository.deleteById(k.key());
        } else {
            repository.save(new AppSetting(k.key(), newValue, actor, now));
        }
        history.save(new AppSettingHistory(k.key(), old, newValue, actor, cleanReason, now));
        audit.record(
            AdminAuditService.AI_CONFIG_CHANGE,
            AdminAuditService.TARGET_AI_SETTING,
            k.key(),
            cleanReason,
            "old=" + abbreviate(old, DETAIL_VALUE_MAX) + " new=" + abbreviate(newValue, DETAIL_VALUE_MAX)
        );
        settings.invalidate();
        return new WriteResult(true, old, newValue);
    }

    private static String abbreviate(String s, int max) {
        if (s == null) return "null";
        return s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
