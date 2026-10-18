package com.dossier.api.service.catalog;

import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.DependenciesRequest;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.DependencyDTO;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The dependency editor (docs/enterprise-v2/21-feature-catalog.md sections 2.5 and 4; story K1.2). A service's dependencies are replaced as a whole:
 * the call names the complete list and anything not named is removed. Four kinds exist: TECHNICAL (a free dependency is added with the service), COMMERCIAL
 * (the customer confirms the cost of both), INTEGRATION (licensed, but refused at use until the integration is connected) and CONSENT (refused until the
 * person consents). A dependency may name a non-purchasable service (an integration or a consent kind, category MODULE) but never an unknown key; the one
 * anyOf rule is {@value DependencyGraph#ANY_CONSUMES_AI} (COMMERCIAL). A save that would close a cycle is refused with 422 DEPENDENCY_CYCLE and the cycle.
 */
@Service
public class DependencyService {

    public static final Set<String> KINDS = Set.of("TECHNICAL", "COMMERCIAL", "INTEGRATION", "CONSENT");
    private static final int MAX_DEPENDENCIES = 50;

    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager em;

    private final JdbcTemplate jdbc;
    private final CatalogChangeRecorder changes;
    private final AdminAuditService audit;

    public DependencyService(JdbcTemplate jdbc, CatalogChangeRecorder changes, AdminAuditService audit) {
        this.jdbc = jdbc;
        this.changes = changes;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<DependencyDTO> get(String featureKey) {
        requireFeature(featureKey);
        return read(featureKey);
    }

    /** Replace every dependency of {@code featureKey} with {@code req.dependencies()}; returns the stored list. */
    @Transactional
    public List<DependencyDTO> replace(String featureKey, DependenciesRequest req) {
        requireFeature(featureKey);
        List<DependencyDTO> wanted = req == null || req.dependencies() == null ? List.of() : req.dependencies();
        if (wanted.size() > MAX_DEPENDENCIES) throw CatalogException.unprocessable("INVALID_VALUE", "A service has at most " + MAX_DEPENDENCIES + " dependencies.");

        List<DependencyDTO> clean = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (DependencyDTO d : wanted) {
            if (d == null || d.requiresFeatureKey() == null || d.requiresFeatureKey().isBlank()) {
                throw CatalogException.unprocessable("INVALID_VALUE", "Every dependency names the service it requires.", Map.of("field", "requiresFeatureKey"));
            }
            String requires = d.requiresFeatureKey().trim();
            String kind = d.kind() == null ? "" : d.kind().trim().toUpperCase(Locale.ROOT);
            if (!KINDS.contains(kind)) {
                throw CatalogException.unprocessable("INVALID_VALUE", "kind must be one of " + KINDS + ".", Map.of("field", "kind", "allowed", List.copyOf(KINDS)));
            }
            if (DependencyGraph.isAnyOf(requires)) {
                if (!DependencyGraph.ANY_CONSUMES_AI.equals(requires) || !"COMMERCIAL".equals(kind)) {
                    throw CatalogException.unprocessable("INVALID_VALUE", "The only anyOf rule is " + DependencyGraph.ANY_CONSUMES_AI + " with kind COMMERCIAL.", Map.of("field", "requiresFeatureKey"));
                }
            } else if (!exists(requires)) {
                throw CatalogException.unprocessable("INVALID_VALUE", "Unknown service " + requires + ".", Map.of("field", "requiresFeatureKey", "value", requires));
            }
            if (d.note() != null && d.note().length() > 200) throw CatalogException.unprocessable("INVALID_VALUE", "note must be at most 200 characters.", Map.of("field", "note"));
            if (!seen.add(requires + "|" + kind)) {
                throw CatalogException.unprocessable("INVALID_VALUE", "Duplicate dependency " + requires + " (" + kind + ").", Map.of("field", "requiresFeatureKey", "value", requires));
            }
            clean.add(new DependencyDTO(requires, kind, d.note() == null || d.note().isBlank() ? null : d.note().trim(), d.active() == null || d.active()));
        }

        // Cycle check on the graph as it WOULD be: every other service's stored dependencies plus the proposed list for this one.
        DependencyGraph graph = new DependencyGraph();
        for (Map<String, Object> row : jdbc.queryForList("SELECT feature_key, requires_feature_key FROM feature_dependency WHERE active = TRUE AND feature_key <> ?", featureKey)) {
            graph.add((String) row.get("feature_key"), (String) row.get("requires_feature_key"));
        }
        for (DependencyDTO d : clean) if (Boolean.TRUE.equals(d.active())) graph.add(featureKey, d.requiresFeatureKey());
        List<String> cycle = graph.findCycle();
        if (!cycle.isEmpty()) {
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("featureKey", featureKey);
            extra.put("cycle", cycle);
            throw CatalogException.unprocessable("DEPENDENCY_CYCLE", "These dependencies would loop: " + String.join(" -> ", cycle) + ".", extra);
        }

        List<DependencyDTO> before = read(featureKey);
        jdbc.update("DELETE FROM feature_dependency WHERE feature_key = ?", featureKey);
        for (DependencyDTO d : clean) {
            jdbc.update(
                "INSERT INTO feature_dependency (feature_key, requires_feature_key, kind, note, active) VALUES (?, ?, ?, ?, ?)",
                featureKey,
                d.requiresFeatureKey(),
                d.kind(),
                d.note(),
                d.active()
            );
        }
        List<DependencyDTO> after = read(featureKey);
        String reason = req == null ? null : req.reason();
        changes.record(CatalogChangeRecorder.ENTITY_FEATURE_DEPENDENCY, featureKey, before, after, reason);
        audit.record(AdminAuditService.CATALOG_DEPENDENCIES_SET, AdminAuditService.TARGET_CATALOG, featureKey, reason, "risk=MEDIUM service=" + featureKey + " count=" + after.size());
        return after;
    }

    private List<DependencyDTO> read(String featureKey) {
        return jdbc.query(
            "SELECT requires_feature_key, kind, note, active FROM feature_dependency WHERE feature_key = ? ORDER BY kind, requires_feature_key",
            (rs, i) -> new DependencyDTO(rs.getString("requires_feature_key"), rs.getString("kind"), rs.getString("note"), rs.getBoolean("active")),
            featureKey
        );
    }

    private void requireFeature(String featureKey) {
        em.flush(); // services created earlier in this transaction are plain JPA writes the JDBC reads below must see
        if (featureKey == null || !exists(featureKey)) throw CatalogException.notFound("service", String.valueOf(featureKey));
    }

    private boolean exists(String featureKey) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM feature_definition WHERE feature_key = ?", Integer.class, featureKey);
        return n != null && n > 0;
    }
}
