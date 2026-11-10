package com.dossier.api.service.ent.licenses;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one place that reads a consultant's organization license (docs/enterprise-v2/LICENCES-BUILD.md L1; doc 24 section 3 step 7). Every org-side
 * feature gate asks this class whether a consultant's live license carries a feature, instead of reading the license tables itself.
 *
 * <p>A license is live when its status grants ({@code ACTIVE}, or {@code CANCEL_AT_PERIOD_END} until it ends) and now is inside its dates. A feature row
 * is live when its flag is on and now is inside its own dates. A SUSPENDED or ENDED license grants nothing. Whether the person's seat and the
 * organization are live is the caller's question (the inbox asks it; Prepare reads the consultant profile): this class only answers for the license.
 *
 * <p>It never reads billing, prices or the personal subscription (decision O4: an enterprise account's only grant is its organization's license).
 */
@Service
@Transactional(readOnly = true)
public class OrgLicenseGate {

    /** License states that still grant their features: a license that is ending keeps them until it ends. */
    public static final Set<String> GRANTING = Set.of("ACTIVE", "CANCEL_AT_PERIOD_END");

    private final ConsultantLicenseRepository licenses;
    private final LicenseFeatureRepository features;
    private final FeatureDefinitionRepository definitions;

    public OrgLicenseGate(ConsultantLicenseRepository licenses, LicenseFeatureRepository features, FeatureDefinitionRepository definitions) {
        this.licenses = licenses;
        this.features = features;
        this.definitions = definitions;
    }

    /** The consultant's license that grants right now, if any (the newest when, against the one-live-license rule, two overlap). */
    public Optional<ConsultantLicense> liveLicense(Long orgId, Long consultantId) {
        return liveLicense(orgId, consultantId, Instant.now());
    }

    public Optional<ConsultantLicense> liveLicense(Long orgId, Long consultantId, Instant now) {
        if (orgId == null || consultantId == null) return Optional.empty();
        for (ConsultantLicense l : licenses.findByOrgIdAndConsultantIdOrderByStartsAtDesc(orgId, consultantId)) {
            if (grants(l, now)) return Optional.of(l);
        }
        return Optional.empty();
    }

    /** The feature keys live on the consultant's live license, with their quantity (empty when nothing grants). */
    public Map<String, Integer> liveFeatures(Long orgId, Long consultantId) {
        return liveFeatures(orgId, consultantId, Instant.now());
    }

    public Map<String, Integer> liveFeatures(Long orgId, Long consultantId, Instant now) {
        Optional<ConsultantLicense> license = liveLicense(orgId, consultantId, now);
        if (license.isEmpty()) return Map.of();
        Map<String, Integer> out = new LinkedHashMap<>();
        for (LicenseFeature f : features.findByOrgIdAndLicenseIdOrderByIdAsc(orgId, license.get().getId())) {
            if (live(f, now)) out.merge(f.getFeatureKey(), quantity(f), Integer::sum);
        }
        return Collections.unmodifiableMap(out);
    }

    /** Whether the consultant's live license carries {@code featureKey} now. {@code base.consultant} is the license itself. */
    public boolean has(Long orgId, Long consultantId, String featureKey) {
        return has(orgId, consultantId, featureKey, Instant.now());
    }

    public boolean has(Long orgId, Long consultantId, String featureKey, Instant now) {
        if (featureKey == null) return false;
        if (com.dossier.api.service.entitlement.FeatureKeys.BASE_CONSULTANT.equals(featureKey)) return liveLicense(orgId, consultantId, now).isPresent();
        return liveFeatures(orgId, consultantId, now).containsKey(featureKey);
    }

    /** Whether the consultant's live license carries at least one of {@code featureKeys} now. */
    public boolean hasAny(Long orgId, Long consultantId, Set<String> featureKeys) {
        Map<String, Integer> live = liveFeatures(orgId, consultantId, Instant.now());
        for (String k : featureKeys) if (live.containsKey(k)) return true;
        return false;
    }

    /** The consultant ids of the organization whose live license carries {@code featureKey} now (one pass over the organization). */
    public Set<Long> consultantsWith(Long orgId, String featureKey) {
        return consultantsWith(orgId, featureKey, Instant.now());
    }

    public Set<Long> consultantsWith(Long orgId, String featureKey, Instant now) {
        Set<Long> out = new HashSet<>();
        if (orgId == null || featureKey == null) return out;
        List<ConsultantLicense> granting = licenses.findByOrgIdAndStatusIn(orgId, GRANTING);
        Map<Long, Long> consultantOf = new HashMap<>();
        for (ConsultantLicense l : granting) if (grants(l, now)) consultantOf.put(l.getId(), l.getConsultantId());
        if (consultantOf.isEmpty()) return out;
        for (LicenseFeature f : features.findByOrgIdAndLicenseIdIn(orgId, consultantOf.keySet())) {
            if (featureKey.equals(f.getFeatureKey()) && live(f, now)) out.add(consultantOf.get(f.getLicenseId()));
        }
        return out;
    }

    /**
     * The consultant's AI budget for one month, in cents (doc 25 section 6): the sum of {@code feature_definition.ai_budget_cents} times quantity over the
     * live features that use AI. Zero when the license carries no AI feature, so the consultant has no server AI.
     */
    public long aiBudgetCents(Long orgId, Long consultantId) {
        Map<String, Integer> live = liveFeatures(orgId, consultantId, Instant.now());
        long cents = 0;
        for (Map.Entry<String, Integer> e : live.entrySet()) {
            Optional<FeatureDefinition> def = definitions.findByFeatureKey(e.getKey());
            if (def.isEmpty()) continue;
            Integer perUnit = def.get().getAiBudgetCents();
            if (perUnit == null || perUnit <= 0) continue;
            cents += (long) perUnit * Math.max(1, e.getValue());
        }
        return cents;
    }

    static boolean grants(ConsultantLicense l, Instant now) {
        return l != null && GRANTING.contains(l.getStatus()) && within(l.getStartsAt(), l.getEndsAt(), now);
    }

    static boolean live(LicenseFeature f, Instant now) {
        return f != null && Boolean.TRUE.equals(f.getLive()) && within(f.getStartsAt(), f.getEndsAt(), now);
    }

    static boolean within(Instant start, Instant end, Instant now) {
        return (start == null || !start.isAfter(now)) && (end == null || end.isAfter(now));
    }

    private static int quantity(LicenseFeature f) {
        return f.getQuantity() == null ? 1 : Math.max(1, f.getQuantity());
    }
}
