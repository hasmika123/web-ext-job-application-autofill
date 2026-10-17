package com.dossier.api.service.catalog;

import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.VolumeTierDTO;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.VolumeTierRequest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Volume tiers (docs/enterprise-v2/21-feature-catalog.md section 2.7, ADR-015; story K1.2): a percentage off an organization's recurring price once it
 * licenses at least {@code minLicensedConsultants}. The table ships empty. {@code productId} NULL means every organization recurring product. Two ACTIVE
 * tiers of the same scope and the same minimum whose effective windows overlap are refused (422 TIER_OVERLAP), so a basket never meets two answers.
 */
@Service
public class VolumeTierService {

    private final JdbcTemplate jdbc;
    private final CatalogChangeRecorder changes;
    private final AdminAuditService audit;

    public VolumeTierService(JdbcTemplate jdbc, CatalogChangeRecorder changes, AdminAuditService audit) {
        this.jdbc = jdbc;
        this.changes = changes;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<VolumeTierDTO> list() {
        return jdbc.query(SELECT + " ORDER BY COALESCE(product_id, 0), min_licensed_consultants, effective_from", this::map);
    }

    @Transactional
    public VolumeTierDTO create(VolumeTierRequest r) {
        Valid v = validate(r, null);
        jdbc.update(
            "INSERT INTO volume_tier (product_id, min_licensed_consultants, pct_off_bp, active, effective_from, effective_until, catalog_version) VALUES (?, ?, ?, ?, ?, ?, 0)",
            v.productId, v.min, v.pct, v.active, Timestamp.from(v.from), v.until == null ? null : Timestamp.from(v.until)
        );
        Long id = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        VolumeTierDTO after = find(id);
        changes.record(CatalogChangeRecorder.ENTITY_VOLUME_TIER, String.valueOf(id), null, after, r.reason());
        audit.record(AdminAuditService.CATALOG_SERVICE_CREATE, AdminAuditService.TARGET_CATALOG, "volume_tier:" + id, r.reason(), "risk=MEDIUM min=" + v.min + " pctOffBp=" + v.pct);
        return after;
    }

    @Transactional
    public VolumeTierDTO update(Long id, VolumeTierRequest r) {
        VolumeTierDTO before = find(id);
        if (before == null) throw CatalogException.notFound("volume tier", String.valueOf(id));
        Valid v = validate(r, id);
        jdbc.update(
            "UPDATE volume_tier SET product_id = ?, min_licensed_consultants = ?, pct_off_bp = ?, active = ?, effective_from = ?, effective_until = ? WHERE id = ?",
            v.productId, v.min, v.pct, v.active, Timestamp.from(v.from), v.until == null ? null : Timestamp.from(v.until), id
        );
        VolumeTierDTO after = find(id);
        changes.record(CatalogChangeRecorder.ENTITY_VOLUME_TIER, String.valueOf(id), before, after, r.reason());
        audit.record(AdminAuditService.CATALOG_SERVICE_UPDATE, AdminAuditService.TARGET_CATALOG, "volume_tier:" + id, r.reason(), "risk=MEDIUM min=" + v.min + " pctOffBp=" + v.pct);
        return after;
    }

    // ---- internals -------------------------------------------------------------

    private static final String SELECT = "SELECT id, product_id, min_licensed_consultants, pct_off_bp, active, effective_from, effective_until, catalog_version FROM volume_tier";

    private record Valid(Long productId, int min, int pct, boolean active, Instant from, Instant until) {}

    private Valid validate(VolumeTierRequest r, Long selfId) {
        if (r == null) throw CatalogException.unprocessable("INVALID_VALUE", "A volume tier body is required.");
        if (r.minLicensedConsultants() == null || r.minLicensedConsultants() < 1 || r.minLicensedConsultants() > 100_000) {
            throw CatalogException.unprocessable("INVALID_VALUE", "minLicensedConsultants must be between 1 and 100000.", Map.of("field", "minLicensedConsultants"));
        }
        if (r.pctOffBp() == null || r.pctOffBp() < 0 || r.pctOffBp() > 5000) {
            throw CatalogException.unprocessable("INVALID_VALUE", "pctOffBp must be between 0 and 5000 basis points.", Map.of("field", "pctOffBp"));
        }
        if (r.productId() != null) {
            Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM product WHERE id = ?", Integer.class, r.productId());
            if (n == null || n == 0) throw CatalogException.unprocessable("INVALID_VALUE", "Unknown product " + r.productId() + ".", Map.of("field", "productId"));
        }
        Instant from = r.effectiveFrom() == null ? Instant.now() : r.effectiveFrom();
        if (r.effectiveUntil() != null && !r.effectiveUntil().isAfter(from)) {
            throw CatalogException.unprocessable("INVALID_VALUE", "effectiveUntil must be after effectiveFrom.", Map.of("field", "effectiveUntil"));
        }
        boolean active = r.active() == null || r.active();
        if (active) {
            // overlap: same scope, same minimum, both active, windows [from, until) intersect
            List<Long> clash = jdbc.queryForList(
                "SELECT id FROM volume_tier WHERE active = TRUE AND id <> ? AND ((product_id IS NULL AND ? IS NULL) OR product_id = ?) AND min_licensed_consultants = ? "
                    + "AND effective_from < COALESCE(?, '9999-12-31 00:00:00') AND COALESCE(effective_until, '9999-12-31 00:00:00') > ?",
                Long.class,
                selfId == null ? -1L : selfId, r.productId(), r.productId(), r.minLicensedConsultants(),
                r.effectiveUntil() == null ? null : Timestamp.from(r.effectiveUntil()), Timestamp.from(from)
            );
            if (!clash.isEmpty()) {
                throw CatalogException.unprocessable("TIER_OVERLAP", "An active tier for the same scope and minimum already covers part of this window.", Map.of("tierIds", clash));
            }
        }
        return new Valid(r.productId(), r.minLicensedConsultants(), r.pctOffBp(), active, from, r.effectiveUntil());
    }

    private VolumeTierDTO find(Long id) {
        List<VolumeTierDTO> rows = jdbc.query(SELECT + " WHERE id = ?", this::map, id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private VolumeTierDTO map(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        long pid = rs.getLong("product_id");
        boolean pidNull = rs.wasNull();
        Timestamp until = rs.getTimestamp("effective_until");
        return new VolumeTierDTO(
            rs.getLong("id"), pidNull ? null : pid, rs.getInt("min_licensed_consultants"), rs.getInt("pct_off_bp"), rs.getBoolean("active"),
            rs.getTimestamp("effective_from").toInstant(), until == null ? null : until.toInstant(), rs.getInt("catalog_version")
        );
    }
}
