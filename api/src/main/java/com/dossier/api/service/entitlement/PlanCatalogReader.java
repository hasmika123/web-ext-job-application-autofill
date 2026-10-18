package com.dossier.api.service.entitlement;

import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanComponent;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.sub.PlanComponentRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.service.entitlement.PlanData.Component;
import com.dossier.api.service.entitlement.PlanData.FeatureDef;
import com.dossier.api.service.entitlement.PlanData.PlanVersionData;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Reads plans and services into the plain data the resolver core works on. The catalog is cached for {@value #TTL_MILLIS} ms (06 section 2: "the catalog
 * is cached 60 s", entitlement sets never are); a published plan version is immutable, so the cache can only lag an admin's edit of a DRAFT or of a
 * service, never a subscriber's payment.
 */
@org.springframework.stereotype.Component
public class PlanCatalogReader {

    private static final Logger LOG = LoggerFactory.getLogger(PlanCatalogReader.class);
    static final long TTL_MILLIS = 60_000L;
    private static final ObjectMapper JSON = new ObjectMapper();

    private record Cached<T>(long at, T value) {
        boolean fresh() {
            return System.currentTimeMillis() - at < TTL_MILLIS;
        }
    }

    private final PlanRepository plans;
    private final PlanVersionRepository versions;
    private final PlanComponentRepository components;
    private final FeatureDefinitionRepository features;

    private final Map<Long, Cached<PlanVersionData>> byId = new ConcurrentHashMap<>();
    private final Map<String, Cached<Optional<PlanVersionData>>> byKey = new ConcurrentHashMap<>();
    private volatile Cached<Map<String, FeatureDef>> featureCache;

    public PlanCatalogReader(
        PlanRepository plans,
        PlanVersionRepository versions,
        PlanComponentRepository components,
        FeatureDefinitionRepository features
    ) {
        this.plans = plans;
        this.versions = versions;
        this.components = components;
        this.features = features;
    }

    /** Drop everything cached (a test, or an admin publish that must show at once). */
    public void clear() {
        byId.clear();
        byKey.clear();
        featureCache = null;
    }

    /** Every service by key. */
    public Map<String, FeatureDef> features() {
        Cached<Map<String, FeatureDef>> c = featureCache;
        if (c != null && c.fresh()) return c.value();
        Map<String, FeatureDef> out = new LinkedHashMap<>();
        for (FeatureDefinition f : features.findAllByOrderBySortOrderAsc()) {
            out.put(
                f.getFeatureKey(),
                new FeatureDef(
                    f.getFeatureKey(),
                    f.getDefaultAllowance() == null ? 0 : f.getDefaultAllowance(),
                    Boolean.TRUE.equals(f.getAdditive()),
                    Boolean.TRUE.equals(f.getConsumesAi()),
                    f.getAiBudgetCents() == null ? 0 : f.getAiBudgetCents(),
                    stringList(f.getEntitlementKeysJson()),
                    f.getLimitKey(),
                    f.getAllowancePeriod()
                )
            );
        }
        featureCache = new Cached<>(System.currentTimeMillis(), Map.copyOf(out));
        return featureCache.value();
    }

    /** One plan version by id, whatever its status (a subscription keeps the version it bought, even a DRAFT seed). */
    public Optional<PlanVersionData> version(long id) {
        Cached<PlanVersionData> c = byId.get(id);
        if (c != null && c.fresh()) return Optional.ofNullable(c.value());
        Optional<PlanVersion> v = versions.findById(id);
        if (v.isEmpty()) return Optional.empty();
        Optional<Plan> p = plans.findById(v.get().getPlanId());
        PlanVersionData data = load(v.get(), p.map(Plan::getPlanKey).orElse("?"));
        byId.put(id, new Cached<>(System.currentTimeMillis(), data));
        return Optional.of(data);
    }

    /**
     * The version a plan key resolves to when a row has no version link yet: the live PUBLISHED version, else the oldest version (the v1 seed, which is
     * behaviour-identical to today). Empty when the plan does not exist.
     */
    public Optional<PlanVersionData> liveOrFirst(String planKey) {
        Cached<Optional<PlanVersionData>> c = byKey.get(planKey);
        if (c != null && c.fresh()) return c.value();
        Optional<PlanVersionData> out = Optional.empty();
        Optional<Plan> plan = plans.findByPlanKey(planKey);
        if (plan.isPresent()) {
            Optional<PlanVersion> live = versions.findLive(plan.get().getId());
            PlanVersion chosen = live.orElse(null);
            if (chosen == null) {
                List<PlanVersion> all = versions.findByPlanIdOrderByVersionDesc(plan.get().getId());
                if (!all.isEmpty()) chosen = all.get(all.size() - 1);
            }
            if (chosen != null) out = Optional.of(load(chosen, planKey));
        }
        byKey.put(planKey, new Cached<>(System.currentTimeMillis(), out));
        return out;
    }

    private PlanVersionData load(PlanVersion v, String planKey) {
        List<Component> comps = new ArrayList<>();
        for (PlanComponent c : components.findByPlanVersionIdOrderBySortOrderAscIdAsc(v.getId())) {
            comps.add(new Component(c.getFeatureKey(), c.getRole(), c.getAllowanceOverride(), longMap(c.getLimitOverridesJson()), c.getDefaultQuantity() == null ? 1 : c.getDefaultQuantity()));
        }
        return new PlanVersionData(v.getId(), planKey, v.getVersion() == null ? 1 : v.getVersion(), v.getStatus(), v.getAiBudgetCapCents() == null ? 0 : v.getAiBudgetCapCents(), comps);
    }

    private static List<String> stringList(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return JSON.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            LOG.warn("Unreadable entitlement_keys_json: {}", e.toString());
            return List.of();
        }
    }

    private static Map<String, Long> longMap(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            Map<String, Number> raw = JSON.readValue(json, new TypeReference<Map<String, Number>>() {});
            Map<String, Long> out = new HashMap<>();
            raw.forEach((k, v) -> out.put(k, v.longValue()));
            return out;
        } catch (Exception e) {
            LOG.warn("Unreadable limit_overrides_json: {}", e.toString());
            return Map.of();
        }
    }
}
