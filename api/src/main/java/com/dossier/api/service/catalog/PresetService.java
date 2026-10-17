package com.dossier.api.service.catalog;

import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.PresetDTO;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.PresetRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Presets (docs/enterprise-v2/21-feature-catalog.md section 2.6; story K1.2): named shortcuts over services. A preset has NO price: applying it adds
 * ordinary services at their own prices (ADR-012). {@code mirrorsProductCode} (PRO or AUTOPILOT) enables the "above individual" check of the margin guard.
 * Table {@code license_preset}; MySQL reserves the word KEY, so every statement quotes the {@code key} column.
 */
@Service
public class PresetService {

    private static final Pattern KEY = Pattern.compile("[A-Z][A-Z0-9_]{1,39}");
    private static final TypeReference<List<String>> STRINGS = new TypeReference<>() {};

    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager em;

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final CatalogChangeRecorder changes;
    private final AdminAuditService audit;

    public PresetService(JdbcTemplate jdbc, ObjectMapper mapper, CatalogChangeRecorder changes, AdminAuditService audit) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.changes = changes;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<PresetDTO> list() {
        return jdbc.query(SELECT + " ORDER BY sort_order, `key`", this::map);
    }

    @Transactional
    public PresetDTO create(PresetRequest r) {
        if (r == null || r.key() == null || !KEY.matcher(r.key()).matches()) {
            throw CatalogException.unprocessable("KEY_FORMAT", "A preset key is upper-case with underscores, such as RESUME_AI_SUPPORT.", Map.of("pattern", KEY.pattern()));
        }
        if (find(r.key()) != null) throw CatalogException.conflict("KEY_EXISTS", "A preset with key " + r.key() + " already exists.", Map.of("key", r.key()));
        Valid v = validate(r);
        jdbc.update(
            "INSERT INTO license_preset (`key`, name, description, feature_keys_json, mirrors_product_code, plan_key, active, sort_order, catalog_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
            r.key(), v.name, v.description, v.featureKeysJson, v.mirrors, v.planKey, v.active, v.sortOrder
        );
        PresetDTO after = find(r.key());
        changes.record(CatalogChangeRecorder.ENTITY_PRESET, r.key(), null, after, r.reason());
        audit.record(AdminAuditService.CATALOG_SERVICE_CREATE, AdminAuditService.TARGET_CATALOG, "preset:" + r.key(), r.reason(), "risk=MEDIUM preset=" + r.key());
        return after;
    }

    @Transactional
    public PresetDTO update(String key, PresetRequest r) {
        PresetDTO before = find(key);
        if (before == null) throw CatalogException.notFound("preset", String.valueOf(key));
        if (r != null && r.key() != null && !r.key().equals(key)) throw CatalogException.unprocessable("KEY_IMMUTABLE", "A preset key never changes.", Map.of("key", key));
        Valid v = validate(r);
        jdbc.update(
            "UPDATE license_preset SET name = ?, description = ?, feature_keys_json = ?, mirrors_product_code = ?, plan_key = ?, active = ?, sort_order = ? WHERE `key` = ?",
            v.name, v.description, v.featureKeysJson, v.mirrors, v.planKey, v.active, v.sortOrder, key
        );
        PresetDTO after = find(key);
        changes.record(CatalogChangeRecorder.ENTITY_PRESET, key, before, after, r.reason());
        audit.record(AdminAuditService.CATALOG_SERVICE_UPDATE, AdminAuditService.TARGET_CATALOG, "preset:" + key, r.reason(), "risk=MEDIUM preset=" + key);
        return after;
    }

    // ---- internals -------------------------------------------------------------

    private static final String SELECT = "SELECT `key`, name, description, feature_keys_json, mirrors_product_code, plan_key, active, sort_order, catalog_version FROM license_preset";

    private record Valid(String name, String description, String featureKeysJson, String mirrors, String planKey, boolean active, int sortOrder) {}

    private Valid validate(PresetRequest r) {
        em.flush(); // see DependencyService: pending JPA writes must be visible to the JDBC reads below
        if (r == null || r.name() == null || r.name().isBlank() || r.name().length() > 80) {
            throw CatalogException.unprocessable("NAME_REQUIRED", "A preset has a name of 1 to 80 characters.", Map.of("field", "name"));
        }
        if (r.description() != null && r.description().length() > 500) throw CatalogException.unprocessable("INVALID_VALUE", "description must be at most 500 characters.", Map.of("field", "description"));
        List<String> keys = r.featureKeys() == null ? List.of() : r.featureKeys();
        if (keys.isEmpty() || keys.size() > 50) throw CatalogException.unprocessable("INVALID_VALUE", "A preset lists 1 to 50 services.", Map.of("field", "featureKeys"));
        Set<String> distinct = new LinkedHashSet<>();
        for (String k : keys) {
            Integer n = k == null ? 0 : jdbc.queryForObject("SELECT COUNT(*) FROM feature_definition WHERE feature_key = ? AND active = TRUE", Integer.class, k);
            if (n == null || n == 0) throw CatalogException.unprocessable("INVALID_VALUE", "Unknown or retired service " + k + ".", Map.of("field", "featureKeys", "value", String.valueOf(k)));
            if (!distinct.add(k)) throw CatalogException.unprocessable("INVALID_VALUE", "Service " + k + " is listed twice.", Map.of("field", "featureKeys", "value", k));
        }
        String mirrors = r.mirrorsProductCode() == null || r.mirrorsProductCode().isBlank() ? null : r.mirrorsProductCode().trim();
        if (mirrors != null) {
            Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM product WHERE code = ?", Integer.class, mirrors);
            if (n == null || n == 0) throw CatalogException.unprocessable("INVALID_VALUE", "Unknown product " + mirrors + ".", Map.of("field", "mirrorsProductCode"));
        }
        String planKey = r.planKey() == null || r.planKey().isBlank() ? null : r.planKey().trim();
        if (planKey != null && planKey.length() > 40) throw CatalogException.unprocessable("INVALID_VALUE", "planKey must be at most 40 characters.", Map.of("field", "planKey"));
        int sort = r.sortOrder() == null ? 0 : r.sortOrder();
        if (sort < 0 || sort > 32000) throw CatalogException.unprocessable("INVALID_VALUE", "sortOrder must be between 0 and 32000.", Map.of("field", "sortOrder"));
        try {
            return new Valid(r.name().trim(), r.description() == null || r.description().isBlank() ? null : r.description().trim(), mapper.writeValueAsString(new ArrayList<>(distinct)), mirrors, planKey, Boolean.TRUE.equals(r.active()), sort);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private PresetDTO find(String key) {
        List<PresetDTO> rows = jdbc.query(SELECT + " WHERE `key` = ?", this::map, key);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private PresetDTO map(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        List<String> keys;
        try {
            keys = mapper.readValue(rs.getString("feature_keys_json"), STRINGS);
        } catch (JsonProcessingException e) {
            keys = List.of();
        }
        return new PresetDTO(
            rs.getString("key"), rs.getString("name"), rs.getString("description"), keys, rs.getString("mirrors_product_code"), rs.getString("plan_key"),
            rs.getBoolean("active"), rs.getInt("sort_order"), rs.getInt("catalog_version")
        );
    }
}
