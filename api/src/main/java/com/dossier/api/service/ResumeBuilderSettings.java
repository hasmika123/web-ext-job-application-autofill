package com.dossier.api.service;

import com.dossier.api.domain.AppSetting;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * The one typed, bounded reader for Resume Builder tunables (DESIGN 15.1, R2.0).
 *
 * <p>Values live in the existing {@code app_setting} table (text), declared once in
 * {@link ResumeBuilderSettingKeys} with their default and bounds. The whole table is cached for
 * {@value #CACHE_SECONDS} seconds (one query serves every getter), so a change made by an admin shows
 * up within a minute, or at once after {@link #invalidate()} for whoever writes it. A value that is
 * missing, unparsable or outside the declared bounds yields the declared default, and is logged at WARN
 * the first time it is seen. Asking for an undeclared key, or for the wrong type of a declared key, is
 * a programming error ({@link IllegalArgumentException}).
 *
 * <p>No tunable of the builder is a literal in code: A5.1's settings registry adopts these keys as is.
 */
@Service
public class ResumeBuilderSettings {

    private static final Logger LOG = LoggerFactory.getLogger(ResumeBuilderSettings.class);

    static final long CACHE_SECONDS = 60;

    private record Snapshot(Map<String, String> values, Instant loadedAt) {}

    private final AppSettingRepository repository;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Set<String> warned = ConcurrentHashMap.newKeySet();
    private volatile Snapshot snapshot;

    @Autowired
    public ResumeBuilderSettings(AppSettingRepository repository, ObjectMapper mapper) {
        this(repository, mapper, Clock.systemUTC());
    }

    ResumeBuilderSettings(AppSettingRepository repository, ObjectMapper mapper, Clock clock) {
        this.repository = repository;
        this.mapper = mapper;
        this.clock = clock;
    }

    public boolean getBool(String key) {
        Key k = typed(key, ResumeBuilderSettingKeys.Type.BOOL);
        return Boolean.parseBoolean(value(k));
    }

    /**
     * The BOOL value an admin actually stored for {@code key}, or empty when none is stored or the stored value is invalid
     * (in which case the caller falls back to something other than the declared default, e.g. an environment property).
     */
    public java.util.Optional<Boolean> getStoredBool(String key) {
        Key k = typed(key, ResumeBuilderSettingKeys.Type.BOOL);
        String stored = snapshot().values().get(k.key());
        if (stored == null || !isValid(k, stored)) return java.util.Optional.empty();
        return java.util.Optional.of(Boolean.parseBoolean(stored.trim()));
    }

    public int getInt(String key) {
        Key k = typed(key, ResumeBuilderSettingKeys.Type.INT);
        return Integer.parseInt(value(k).trim());
    }

    public double getDecimal(String key) {
        Key k = typed(key, ResumeBuilderSettingKeys.Type.DECIMAL);
        return Double.parseDouble(value(k).trim());
    }

    /** A STRING or ENUM key. */
    public String getString(String key) {
        Key k = ResumeBuilderSettingKeys.require(key);
        if (k.type() != ResumeBuilderSettingKeys.Type.STRING && k.type() != ResumeBuilderSettingKeys.Type.ENUM) {
            throw new IllegalArgumentException(k.key() + " is " + k.type() + ", not STRING or ENUM");
        }
        return value(k);
    }

    /** A JSON key, converted to {@code type} ({@link JsonNode}, a Map, a String[] ...). */
    public <T> T getJson(String key, Class<T> type) {
        Key k = typed(key, ResumeBuilderSettingKeys.Type.JSON);
        try {
            return mapper.treeToValue(mapper.readTree(value(k)), type);
        } catch (Exception e) {
            throw new IllegalArgumentException(k.key() + " cannot be read as " + type.getSimpleName(), e);
        }
    }

    /** Drop the cache so the next read sees the table as it is now (call after writing a setting). */
    public void invalidate() {
        snapshot = null;
    }

    // ---- internals ----------------------------------------------------------

    private Key typed(String key, ResumeBuilderSettingKeys.Type type) {
        Key k = ResumeBuilderSettingKeys.require(key);
        if (k.type() != type) throw new IllegalArgumentException(k.key() + " is " + k.type() + ", not " + type);
        return k;
    }

    /** The stored value when it is valid for {@code k}, else the declared default. */
    private String value(Key k) {
        String stored = snapshot().values().get(k.key());
        if (stored == null) return k.defaultValue();
        if (isValid(k, stored)) return stored;
        if (warned.add(k.key() + "=" + stored)) {
            LOG.warn(
                "Resume Builder setting {} has an invalid value ({}); using the default {}",
                k.key(),
                stored.length() > 80 ? stored.substring(0, 80) + "..." : stored,
                k.defaultValue()
            );
        }
        return k.defaultValue();
    }

    private Snapshot snapshot() {
        Snapshot s = snapshot;
        Instant now = clock.instant();
        if (s != null && Duration.between(s.loadedAt(), now).getSeconds() < CACHE_SECONDS) return s;
        Map<String, String> values = new HashMap<>();
        for (AppSetting row : repository.findAll()) {
            if (row.getKey() != null && row.getValue() != null) {
                values.put(ResumeBuilderSettingKeys.canonical(row.getKey()), row.getValue());
            }
        }
        s = new Snapshot(Map.copyOf(values), now);
        snapshot = s;
        return s;
    }

    /** Whether {@code raw} is an acceptable value for {@code k}: parses, within bounds, allowed, shaped. */
    static boolean isValid(Key k, String raw, ObjectMapper mapper) {
        try {
            switch (k.type()) {
                case BOOL -> {
                    return "true".equalsIgnoreCase(raw.trim()) || "false".equalsIgnoreCase(raw.trim());
                }
                case INT -> {
                    int v = Integer.parseInt(raw.trim());
                    return inBounds(k, v);
                }
                case DECIMAL -> {
                    double v = Double.parseDouble(raw.trim());
                    return Double.isFinite(v) && inBounds(k, v);
                }
                case STRING, ENUM -> {
                    if (raw.isBlank()) return false;
                    return k.allowed() == null || k.allowed().contains(raw);
                }
                case JSON -> {
                    JsonNode n = mapper.readTree(raw);
                    return n != null && (k.jsonCheck() == null || k.jsonCheck().test(n));
                }
                default -> {
                    return false;
                }
            }
        } catch (Exception e) {
            return false;
        }
    }

    private boolean isValid(Key k, String raw) {
        return isValid(k, raw, mapper);
    }

    private static boolean inBounds(Key k, double v) {
        return (k.min() == null || v >= k.min()) && (k.max() == null || v <= k.max());
    }
}
