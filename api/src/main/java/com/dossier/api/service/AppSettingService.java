package com.dossier.api.service;

import com.dossier.api.domain.AppSetting;
import com.dossier.api.repository.AppSettingRepository;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads and writes the {@code app_setting} key/value table (phase demo).
 *
 * <p>Reads are cached for a few seconds. The login page and the read-only guard ask "is the demo on?"
 * on every request, so hitting the table each time would be wasteful, but the cache is short on
 * purpose: an operator who flips the switch with a SQL {@code UPDATE} (no restart, no admin UI) sees
 * it take effect almost at once. A {@link #set} through this service updates the cache immediately.
 */
@Service
public class AppSettingService {

    private static final Logger LOG = LoggerFactory.getLogger(AppSettingService.class);

    /** How long a read stays cached before the table is consulted again. */
    static final long TTL_MILLIS = 5_000;

    /** A cached read: the row (or null for "no such row") and when it was loaded. */
    private record Cached(AppSetting row, long loadedAtMillis) {}

    private final AppSettingRepository repository;
    private final LongSupplier clock;
    private final ConcurrentHashMap<String, Cached> cache = new ConcurrentHashMap<>();

    @Autowired
    public AppSettingService(AppSettingRepository repository) {
        this(repository, System::currentTimeMillis);
    }

    /** Test seam: lets a test move the clock instead of sleeping. */
    AppSettingService(AppSettingRepository repository, LongSupplier clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /** The value stored under {@code key}, or {@code defaultValue} when there is no row or it is empty. */
    public String get(String key, String defaultValue) {
        AppSetting row = load(key);
        return row == null || row.getValue() == null ? defaultValue : row.getValue();
    }

    /** Boolean convenience over {@link #get}: {@code "true"} (any case) is true, anything else false. */
    public boolean getBoolean(String key, boolean defaultValue) {
        return Boolean.parseBoolean(get(key, Boolean.toString(defaultValue)));
    }

    /** The whole row (value plus who/when last changed), if there is one. */
    public Optional<AppSetting> find(String key) {
        return Optional.ofNullable(load(key));
    }

    /** Upsert {@code key}, stamping who changed it and when, and refresh the cache. */
    @Transactional
    public AppSetting set(String key, String value, String by) {
        AppSetting row = repository.findById(key).orElseGet(AppSetting::new);
        row.setKey(key);
        row.setValue(value);
        row.setUpdatedBy(by == null ? null : (by.length() > 50 ? by.substring(0, 50) : by));
        row.setUpdatedDate(Instant.now());
        AppSetting saved = repository.save(row);
        cache.put(key, new Cached(saved, clock.getAsLong()));
        LOG.info("App setting '{}' set to '{}' by '{}'", key, value, by);
        return saved;
    }

    private AppSetting load(String key) {
        long now = clock.getAsLong();
        Cached hit = cache.get(key);
        if (hit != null && now - hit.loadedAtMillis() < TTL_MILLIS) {
            return hit.row();
        }
        AppSetting row = repository.findById(key).orElse(null);
        cache.put(key, new Cached(row, now));
        return row;
    }
}
