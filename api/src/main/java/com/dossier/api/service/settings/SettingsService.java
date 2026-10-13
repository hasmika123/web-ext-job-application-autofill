package com.dossier.api.service.settings;

import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.AppSettingHistory;
import com.dossier.api.repository.AppSettingHistoryRepository;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.AdminSettingsWriter;
import com.dossier.api.service.AdminSettingsWriter.Risk;
import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.dossier.api.service.ResumeBuilderSettingKeys.Type;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ai.AiRuntimeSettings;
import com.dossier.api.service.ai.AiRuntimeSettings.Resolved;
import com.dossier.api.service.ai.AiRuntimeSettings.Source;
import com.dossier.api.service.ai.AiSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one read and write seam over every runtime setting (A5.1, ADMIN-E2E-PLAN 2.1).
 *
 * <p><b>Reads.</b> {@link #resolve} answers "what is this key right now and why": the stored row ({@code db}), else
 * the environment value for the few keys that have one ({@code env}), else the declared code default
 * ({@code default}) - the same precedence {@link AiRuntimeSettings} applies to the AI keys, which it delegates to so
 * the Settings home and the AI page never disagree. The typed getters ({@link #getInt} ...) apply that precedence
 * too. {@link ResumeBuilderSettings} keeps reading rows then code defaults, unchanged: no existing caller behaves
 * differently, and the cache (60 s, dropped on every write) is shared.
 *
 * <p><b>Writes.</b> {@link #set}, {@link #reset} and {@link #revert} validate against the registry
 * ({@link SettingDefinitions}), enforce the reason rule for HIGH changes, then go through
 * {@link AdminSettingsWriter} (row + {@code app_setting_history} + {@code SETTING_CHANGE} audit + cache drop after
 * commit), all in the caller's transaction. A refusal is a {@link SettingsException} and leaves nothing behind.
 *
 * <p>No secret is ever a setting, so no value, default or history row returned here is one.
 */
@Service
public class SettingsService {

    /** One setting as the admin API reports it. Numbers keep their JSON type; JSON and FLAG values are objects/arrays. */
    public record SettingItem(
        String key,
        String area,
        String type,
        String risk,
        String reasonRule,
        String description,
        Object value,
        Source source,
        Object envDefault,
        Object codeDefault,
        Number min,
        Number max,
        List<String> allowed,
        String updatedBy,
        Instant updatedAt,
        String lastReason
    ) {}

    public record AreaSummary(String area, int count, int highCount) {}

    public record SettingsView(List<AreaSummary> areas, List<SettingItem> items) {}

    public record HistoryRow(Long id, String key, String oldValue, String newValue, String actorLogin, String reason, Instant changedAt) {}

    static final int HISTORY_DEFAULT = 50;
    static final int HISTORY_MAX = 200;
    private static final int VALUE_MAX_CHARS = 1000;
    private static final int REASON_MAX_CHARS = 500;

    /** Settings that mirror a deployment property, so a deleted row falls back to it before the code default. */
    private static final Map<String, String> ENV_PROPERTY = Map.of(
        AdminSettingKeys.INBOX_RETENTION_DAYS,
        "dossier.inbox.retention-days",
        AdminSettingKeys.OPS_ERROR_DIGEST_TO,
        "dossier.ops.error-digest.to",
        AdminSettingKeys.OPS_ERROR_DIGEST_INTERVAL_MIN,
        "dossier.ops.error-digest.interval"
    );

    private final ResumeBuilderSettings settings;
    private final AiRuntimeSettings aiRuntime;
    private final AdminSettingsWriter writer;
    private final AppSettingRepository rows;
    private final AppSettingHistoryRepository history;
    private final Environment environment;
    private final ObjectMapper mapper;

    public SettingsService(
        ResumeBuilderSettings settings,
        AiRuntimeSettings aiRuntime,
        AdminSettingsWriter writer,
        AppSettingRepository rows,
        AppSettingHistoryRepository history,
        Environment environment,
        ObjectMapper mapper
    ) {
        this.settings = settings;
        this.aiRuntime = aiRuntime;
        this.writer = writer;
        this.rows = rows;
        this.history = history;
        this.environment = environment;
        this.mapper = mapper;
    }

    // ---- typed reads (row, then env, then code default) -----------------------

    public boolean getBool(String key) {
        return Boolean.parseBoolean(effective(key, Type.BOOL).trim());
    }

    public int getInt(String key) {
        return Integer.parseInt(effective(key, Type.INT).trim());
    }

    public double getDecimal(String key) {
        return Double.parseDouble(effective(key, Type.DECIMAL).trim());
    }

    /** A STRING or ENUM key. */
    public String getString(String key) {
        return effective(key, Type.STRING, Type.ENUM);
    }

    /** A JSON key (or flag), converted to {@code type}. */
    public <T> T getJson(String key, Class<T> type) {
        String raw = effective(key, Type.JSON);
        try {
            return mapper.treeToValue(mapper.readTree(raw), type);
        } catch (Exception e) {
            throw new IllegalArgumentException(key + " cannot be read as " + type.getSimpleName(), e);
        }
    }

    /** The value of {@code key} with its provenance. Typed: Boolean, Integer, Double, String, or JsonNode (JSON/FLAG). */
    public Resolved<Object> resolve(String key) {
        Key k = require(key);
        if (AiSettingKeys.find(k.key()) != null) return aiRuntime.resolved(k.key());
        Optional<String> row = settings.stored(k.key());
        String env = envValue(k);
        String code = k.defaultValue();
        Object codeValue = typed(k, code);
        if (row.isPresent()) return new Resolved<>(typed(k, row.get()), Source.DB, env == null ? null : typed(k, env), codeValue);
        if (env != null) return new Resolved<>(typed(k, env), Source.ENV, typed(k, env), codeValue);
        return new Resolved<>(codeValue, Source.DEFAULT, null, codeValue);
    }

    // ---- the admin view -------------------------------------------------------

    /**
     * Every setting (plus any stored AI price row), optionally narrowed to {@code area} and to the keys/descriptions
     * containing {@code q}. {@code areas} counts the {@code q} matches in every area, so the rail still shows where the hits are.
     */
    @Transactional(readOnly = true)
    public SettingsView list(String area, String q) {
        String wantedArea = area == null || area.isBlank() ? null : area.trim().toLowerCase(Locale.ROOT);
        String needle = q == null || q.isBlank() ? null : q.trim().toLowerCase(Locale.ROOT);
        Map<String, AppSetting> stored = storedRows();
        Map<String, AppSettingHistory> latest = latestHistory();

        List<Key> keys = new ArrayList<>(SettingDefinitions.all());
        for (String priceKey : settings.storedWithPrefix("ai.price.").keySet()) {
            Key k = SettingDefinitions.find(priceKey);
            if (k != null && !keys.contains(k)) keys.add(k);
        }

        Map<String, int[]> counts = new TreeMap<>();
        List<SettingItem> items = new ArrayList<>();
        for (Key k : keys) {
            if (needle != null && !k.key().toLowerCase(Locale.ROOT).contains(needle) && !k.description().toLowerCase(Locale.ROOT).contains(needle)) continue;
            int[] c = counts.computeIfAbsent(k.area(), a -> new int[2]);
            c[0]++;
            if (SettingDefinitions.declaredRisk(k) == Risk.HIGH) c[1]++;
            if (wantedArea != null && !k.area().equals(wantedArea)) continue;
            items.add(item(k, stored.get(k.key()), latest.get(k.key())));
        }
        List<AreaSummary> areas = new ArrayList<>();
        counts.forEach((a, c) -> areas.add(new AreaSummary(a, c[0], c[1])));
        return new SettingsView(areas, items);
    }

    /** One setting, as the list reports it. */
    @Transactional(readOnly = true)
    public SettingItem get(String key) {
        Key k = require(key);
        return item(k, rows.findById(k.key()).orElse(null), history.findByKeyOrderByIdDesc(k.key(), PageRequest.of(0, 1)).stream().findFirst().orElse(null));
    }

    /** The changes to {@code key}, newest first. */
    @Transactional(readOnly = true)
    public List<HistoryRow> history(String key, Integer limit) {
        Key k = require(key);
        int n = limit == null || limit < 1 ? HISTORY_DEFAULT : Math.min(limit, HISTORY_MAX);
        return history.findByKeyOrderByIdDesc(k.key(), PageRequest.of(0, n)).stream().map(SettingsService::historyRow).toList();
    }

    // ---- writes ---------------------------------------------------------------

    /** Set {@code key} to {@code value} (a JSON scalar, object or array, per the key's type). */
    @Transactional
    public SettingItem set(String key, JsonNode value, String reason) {
        Key k = require(key);
        return apply(k, text(k, value), reason, "");
    }

    /** Delete the stored row so {@code key} falls back to its env/code default. */
    @Transactional
    public SettingItem reset(String key, String reason) {
        Key k = require(key);
        return apply(k, null, reason, "");
    }

    /** Undo the change recorded in history row {@code historyId}: restore the value the key had before it (a new history row). */
    @Transactional
    public SettingItem revert(String key, Long historyId, String reason) {
        Key k = require(key);
        AppSettingHistory row = historyId == null ? null : history.findById(historyId).filter(h -> h.getKey().equals(k.key())).orElse(null);
        if (row == null) throw SettingsException.historyNotFound(k.key(), historyId);
        return apply(k, row.getOldValue(), reason, "revert=" + row.getId() + " ");
    }

    private SettingItem apply(Key k, String newValueOrNull, String reason, String auditMarker) {
        String newValue = newValueOrNull == null ? null : newValueOrNull.trim();
        if (newValue != null) validate(k, newValue);
        String cleanReason = reason == null || reason.isBlank() ? null : abbreviate(reason.trim(), REASON_MAX_CHARS);
        // What will be in effect afterwards decides the risk: a deleted row falls back to the env/code default.
        Risk risk = SettingDefinitions.riskOf(k, newValue != null ? newValue : fallbackText(k));
        if (risk == Risk.HIGH && (cleanReason == null || cleanReason.length() < SettingsException.REASON_MIN_LENGTH)) throw SettingsException.reasonRequired(k.key());
        writer.writeValidated(
            k,
            newValue,
            cleanReason,
            AdminAuditService.SETTING_CHANGE,
            AdminAuditService.TARGET_SETTING,
            "area=" + k.area() + " risk=" + risk + " " + auditMarker
        );
        return get(k.key());
    }

    private void validate(Key k, String value) {
        if (value.length() > VALUE_MAX_CHARS) throw outOfBounds(k, "Too long (at most " + VALUE_MAX_CHARS + " characters).");
        String shape = AiSettingKeys.shapeError(k, value);
        if (AiSettingKeys.CODE_MODEL_INVALID.equals(shape)) throw outOfBounds(k, "Not a model id (letters, digits, . _ : / -).");
        if (AiSettingKeys.CODE_URL_INVALID.equals(shape)) throw outOfBounds(k, "Must be an https:// URL (http:// only for localhost).");
        if (AdminSettingKeys.shapeError(k, value) != null) throw outOfBounds(k, shapeMessage(k));
        if (!ResumeBuilderSettings.isValid(k, value, mapper)) throw outOfBounds(k, null);
    }

    private static String shapeMessage(Key k) {
        return switch (k.key()) {
            case AdminSettingKeys.EXT_MIN_VERSION, AdminSettingKeys.EXT_RULES_VERSION_HINT -> "Must look like 1.2.3 (major.minor.patch).";
            case AdminSettingKeys.OPS_ERROR_DIGEST_TO -> "Must be an email address, or blank.";
            default -> null;
        };
    }

    private static SettingsException outOfBounds(Key k, String message) {
        return SettingsException.outOfBounds(k.key(), k.min(), k.max(), k.allowed(), message);
    }

    /** The text stored for a JSON request value, per the key's type; anything of the wrong shape is out of bounds. */
    private String text(Key k, JsonNode v) {
        if (v == null || v.isNull() || v.isMissingNode()) throw outOfBounds(k, "A value is required (use reset to go back to the default).");
        boolean wrongShape = false;
        switch (k.type()) {
            case BOOL -> {
                if (v.isBoolean() || v.isTextual()) return v.asText();
                wrongShape = true;
            }
            case INT -> {
                if (v.isIntegralNumber() || v.isTextual()) return v.asText();
                wrongShape = true;
            }
            case DECIMAL -> {
                if (v.isNumber()) return v.decimalValue().toPlainString();
                if (v.isTextual()) return v.asText();
                wrongShape = true;
            }
            case STRING, ENUM -> {
                if (v.isTextual()) return v.asText();
                wrongShape = true;
            }
            case JSON -> {
                if (v.isTextual()) return v.asText(); // a JSON document sent as text (a textarea)
                try {
                    return mapper.writeValueAsString(v);
                } catch (Exception e) {
                    wrongShape = true;
                }
            }
            default -> wrongShape = true;
        }
        throw outOfBounds(k, wrongShape ? "Wrong kind of value for a " + SettingDefinitions.typeName(k) + " setting." : null);
    }

    // ---- internals ------------------------------------------------------------

    private Key require(String key) {
        Key k = key == null ? null : SettingDefinitions.find(key.trim());
        if (k == null) throw SettingsException.unknownKey(key);
        return k;
    }

    /** The text in effect for {@code key}: a valid row, else a valid env value, else the code default. */
    private String effective(String key, Type... types) {
        Key k = SettingDefinitions.find(key);
        if (k == null) throw new IllegalArgumentException("Unknown setting: " + key);
        boolean ok = false;
        for (Type t : types) ok |= k.type() == t;
        if (!ok) throw new IllegalArgumentException(k.key() + " is " + k.type() + ", not " + types[0]);
        Optional<String> row = settings.stored(k.key());
        if (row.isPresent()) return row.get();
        String env = envValue(k);
        return env != null ? env : k.defaultValue();
    }

    /** The text a deleted row falls back to: the env value when there is one, else the code default. */
    private String fallbackText(Key k) {
        if (AiSettingKeys.find(k.key()) != null) {
            Resolved<Object> r = aiRuntime.resolved(k.key());
            Object v = r.envDefault() != null ? r.envDefault() : r.codeDefault();
            return v instanceof List<?> ? k.defaultValue() : String.valueOf(v);
        }
        String env = envValue(k);
        return env != null ? env : k.defaultValue();
    }

    /** The deployment property behind {@code k}, as text, when it has one and the value is acceptable; else null. */
    private String envValue(Key k) {
        String property = ENV_PROPERTY.get(k.key());
        if (property == null) return null;
        try {
            Binder binder = Binder.get(environment);
            String raw;
            if (AdminSettingKeys.OPS_ERROR_DIGEST_INTERVAL_MIN.equals(k.key())) {
                raw = binder.bind(property, Duration.class).map(d -> String.valueOf(d.toMinutes())).orElse(null);
            } else {
                raw = binder.bind(property, String.class).orElse(null);
                if (raw == null && AdminSettingKeys.OPS_ERROR_DIGEST_TO.equals(k.key())) raw = binder.bind("dossier.ops.error-digest.fallback-to", String.class).orElse(null);
            }
            if (raw == null || (raw.isBlank() && k.type() != Type.STRING)) return null;
            return ResumeBuilderSettings.isValid(k, raw, mapper) ? raw.trim() : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    private Object typed(Key k, String s) {
        if (s == null) return null;
        try {
            return switch (k.type()) {
                case BOOL -> Boolean.parseBoolean(s.trim());
                case INT -> Integer.parseInt(s.trim());
                case DECIMAL -> Double.parseDouble(s.trim());
                case JSON -> mapper.readTree(s);
                default -> s;
            };
        } catch (Exception e) {
            return s;
        }
    }

    private SettingItem item(Key k, AppSetting stored, AppSettingHistory latest) {
        Resolved<Object> r = resolve(k.key());
        boolean db = r.source() == Source.DB && stored != null;
        return new SettingItem(
            k.key(),
            k.area(),
            SettingDefinitions.typeName(k),
            SettingDefinitions.declaredRisk(k).name(),
            SettingDefinitions.reasonRule(k),
            k.description(),
            r.value(),
            r.source(),
            r.envDefault(),
            r.codeDefault(),
            number(k.min()),
            number(k.max()),
            k.allowed(),
            db ? stored.getUpdatedBy() : null,
            db ? stored.getUpdatedDate() : null,
            db && latest != null && latest.getNewValue() != null ? latest.getReason() : null
        );
    }

    private static Number number(Double d) {
        if (d == null) return null;
        return d % 1 == 0 ? (Number) d.longValue() : d;
    }

    private Map<String, AppSetting> storedRows() {
        Map<String, AppSetting> out = new HashMap<>();
        for (AppSetting row : rows.findAll()) out.put(row.getKey(), row);
        return out;
    }

    private Map<String, AppSettingHistory> latestHistory() {
        Map<String, AppSettingHistory> out = new LinkedHashMap<>();
        for (AppSettingHistory h : history.findLatestPerKey()) out.put(h.getKey(), h);
        return out;
    }

    private static HistoryRow historyRow(AppSettingHistory h) {
        return new HistoryRow(h.getId(), h.getKey(), h.getOldValue(), h.getNewValue(), h.getActorLogin(), h.getReason(), h.getChangedAt());
    }

    private static String abbreviate(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }
}
