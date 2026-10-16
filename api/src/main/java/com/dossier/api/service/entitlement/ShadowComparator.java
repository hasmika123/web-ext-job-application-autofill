package com.dossier.api.service.entitlement;

import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * Shadow mode of the catalog resolver (story K7.1, docs/subscriptions/06-entitlements-and-enforcement.md section 4, switch
 * {@code billing.catalog.shadow}, default on). While on, the legacy row logic keeps answering every gate and the {@link PlanResolver} runs beside it;
 * a disagreement is logged with the login and the feature only (no other personal data) and counted as {@code entitlement.shadow_mismatch}. The
 * resolver can never break a gate: any failure inside it is logged and swallowed.
 */
@Component
public class ShadowComparator {

    private static final Logger LOG = LoggerFactory.getLogger(ShadowComparator.class);

    private final PlanResolver resolver;
    private final SettingsService settings;
    private final ObjectProvider<MeterRegistry> meters;
    private final AtomicLong mismatches = new AtomicLong();

    public ShadowComparator(PlanResolver resolver, SettingsService settings, ObjectProvider<MeterRegistry> meters) {
        this.resolver = resolver;
        this.settings = settings;
        this.meters = meters;
    }

    /** True while the legacy logic decides. A settings failure counts as on: shadow is the safe side. */
    public boolean shadowOn() {
        try {
            return settings.getBool(BillingSettingKeys.CATALOG_SHADOW);
        } catch (RuntimeException e) {
            LOG.debug("billing.catalog.shadow unreadable, treating as on: {}", e.toString());
            return true;
        }
    }

    /** The resolved personal set, or empty when the resolver cannot answer (it is logged, never thrown). */
    public Optional<EntitlementSet> resolve(String login) {
        try {
            return Optional.of(resolver.resolvePersonal(login));
        } catch (RuntimeException e) {
            LOG.warn("entitlement resolver failed for {}: {}", login, e.toString());
            return Optional.empty();
        }
    }

    /** How many mismatches this process has seen (tests and the flip checklist read it). */
    public long mismatchCount() {
        return mismatches.get();
    }

    /** Compare the legacy yes/no for {@code key} with the resolver's. */
    public void compareHas(String login, String key, boolean legacy) {
        resolve(login).ifPresent(set -> {
            boolean resolved = set.has(key);
            if (resolved != legacy) mismatch(login, key, String.valueOf(legacy), String.valueOf(resolved));
        });
    }

    /** Compare a legacy limit with the resolver's. */
    public void compareLimit(String login, String limitKey, long legacy) {
        resolve(login).ifPresent(set -> {
            long resolved = set.limit(limitKey);
            if (resolved != legacy) mismatch(login, limitKey, String.valueOf(legacy), String.valueOf(resolved));
        });
    }

    /** Compare the legacy AI budget (cents) with the resolver's window budget. */
    public void compareAiBudgetCents(String login, long legacyCents, Long resolvedCents) {
        if (resolvedCents == null || resolvedCents != legacyCents) mismatch(login, "ai.budget", String.valueOf(legacyCents), String.valueOf(resolvedCents));
    }

    private void mismatch(String login, String feature, String legacy, String resolved) {
        mismatches.incrementAndGet();
        LOG.warn("entitlement.shadow_mismatch login={} feature={} legacy={} resolved={}", login, feature, legacy, resolved);
        MeterRegistry registry = meters.getIfAvailable();
        if (registry != null) registry.counter("entitlement.shadow_mismatch", "feature", feature).increment();
    }
}
