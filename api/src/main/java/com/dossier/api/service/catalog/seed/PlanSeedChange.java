package com.dossier.api.service.catalog.seed;

import com.dossier.api.service.catalog.seed.PlanSeedData.Comp;
import com.dossier.api.service.catalog.seed.PlanSeedData.PlanSpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HexFormat;
import java.util.List;
import liquibase.change.custom.CustomTaskChange;
import liquibase.database.Database;
import liquibase.database.jvm.JdbcConnection;
import liquibase.exception.CustomChangeException;
import liquibase.exception.ValidationErrors;
import liquibase.resource.ResourceAccessor;

/**
 * Seeds the plans of {@link PlanSeedData} ({@code 20261101040000_sub_backfill.xml}, changeSet {@code sub-seed-plans}; story K2.1): {@code plan},
 * version 1 of each and its components, through plain JDBC. <b>Idempotent</b>: a plan whose key already exists is skipped whole, so a rerun inserts nothing
 * and an admin's later edit is never overwritten. FREE v1 is PUBLISHED (it needs no price) and recorded as catalog version 1 in {@code catalog_publish};
 * every other plan stays DRAFT because the catalog has no prices. It never writes a {@code product_price} row.
 */
public class PlanSeedChange implements CustomTaskChange {

    /** The actor recorded on seeded rows. */
    static final String ACTOR = "seed";

    @Override
    public void execute(Database database) throws CustomChangeException {
        try {
            seed(((JdbcConnection) database.getConnection()).getUnderlyingConnection());
        } catch (SQLException e) {
            throw new CustomChangeException("plan seed failed: " + e.getMessage(), e);
        }
    }

    /** Seed on {@code c} (the caller owns the transaction). Returns how many plans it inserted. */
    public static int seed(Connection c) throws SQLException {
        int inserted = 0;
        Long publishedVersionId = null;
        for (PlanSpec spec : PlanSeedData.PLANS) {
            if (find(c, "SELECT id FROM plan WHERE plan_key = ?", spec.planKey()) != null) continue;
            long planId = insertPlan(c, spec);
            long versionId = insertVersion(c, spec, planId);
            insertComponents(c, spec, versionId);
            if ("PUBLISHED".equals(spec.versionStatus())) {
                String snapshot = snapshot(spec);
                try (PreparedStatement ps = c.prepareStatement("UPDATE plan_version SET snapshot_json = ?, snapshot_hash = ? WHERE id = ?")) {
                    ps.setString(1, snapshot);
                    ps.setString(2, sha256(snapshot));
                    ps.setLong(3, versionId);
                    ps.executeUpdate();
                }
                publishedVersionId = versionId;
            }
            inserted++;
        }
        if (publishedVersionId != null && find(c, "SELECT id FROM catalog_publish WHERE id = 1") == null) {
            try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO catalog_publish (id, published_at, published_by, summary, price_ids_json, feature_keys_json, plan_version_ids_json, snapshot_hash) VALUES (1, NOW(6), ?, ?, '[]', NULL, ?, NULL)"
            )) {
                ps.setString(1, ACTOR);
                ps.setString(2, "Seed: plan FREE v1 (behaviour-identical to today). No prices.");
                ps.setString(3, "[" + publishedVersionId + "]");
                ps.executeUpdate();
            }
            try (PreparedStatement ps = c.prepareStatement("UPDATE plan_version SET catalog_version = 1 WHERE id = ?")) {
                ps.setLong(1, publishedVersionId);
                ps.executeUpdate();
            }
        }
        return inserted;
    }

    private static long insertPlan(Connection c, PlanSpec s) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
            "INSERT INTO plan (plan_key, name, audience, status, public, description, badge, sort_order, eligibility_json, successor_plan_id, created_at, created_by, updated_at, updated_by) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NOW(6), ?, NOW(6), ?)",
            Statement.RETURN_GENERATED_KEYS
        )) {
            ps.setString(1, s.planKey());
            ps.setString(2, s.name());
            ps.setString(3, s.audience());
            ps.setString(4, s.planStatus());
            ps.setBoolean(5, s.publicPlan());
            ps.setString(6, s.description());
            ps.setString(7, s.badge());
            ps.setInt(8, s.sort());
            ps.setString(9, ACTOR);
            ps.setString(10, ACTOR);
            ps.executeUpdate();
            return key(ps);
        }
    }

    private static long insertVersion(Connection c, PlanSpec s, long planId) throws SQLException {
        Long baseProduct = s.baseProductCode() == null ? null : find(c, "SELECT id FROM product WHERE code = ?", s.baseProductCode());
        if (s.baseProductCode() != null && baseProduct == null) throw new SQLException("seed product " + s.baseProductCode() + " is missing; seed the services first");
        String seatRules = s.orgPlan() ? seatRules(c) : null;
        boolean published = "PUBLISHED".equals(s.versionStatus());
        try (PreparedStatement ps = c.prepareStatement(
            "INSERT INTO plan_version (plan_id, version, status, effective_from, effective_until, catalog_version, base_product_id, intervals_json, annual_discount_bp, ai_budget_cap_cents, "
                + "seat_rules_json, presets_json, snapshot_json, snapshot_hash, summary, published_at, published_by, created_at, created_by, updated_at) "
                + "VALUES (?, 1, ?, " + (published ? "NOW(6)" : "NULL") + ", NULL, NULL, ?, ?, NULL, ?, ?, NULL, NULL, NULL, ?, " + (published ? "NOW(6), ?" : "NULL, NULL") + ", NOW(6), ?, NOW(6))",
            Statement.RETURN_GENERATED_KEYS
        )) {
            int i = 1;
            ps.setLong(i++, planId);
            ps.setString(i++, s.versionStatus());
            if (baseProduct == null) ps.setNull(i++, java.sql.Types.BIGINT);
            else ps.setLong(i++, baseProduct);
            ps.setString(i++, s.intervalsJson());
            ps.setInt(i++, s.aiBudgetCapCents());
            ps.setString(i++, seatRules);
            ps.setString(i++, "Version 1: today's behaviour" + (published ? "." : ", draft until its prices are published."));
            if (published) ps.setString(i++, ACTOR);
            ps.setString(i, ACTOR);
            ps.executeUpdate();
            return key(ps);
        }
    }

    /** The organization plan's seat rules; product ids are looked up by code, the seat ceiling stays a setting. */
    private static String seatRules(Connection c) throws SQLException {
        Long seat = find(c, "SELECT id FROM product WHERE code = 'ORG_BASE_LICENSE'");
        Long setup = find(c, "SELECT id FROM product WHERE code = 'ORG_SETUP_FEE'");
        Long platform = find(c, "SELECT id FROM product WHERE code = 'ORG_PLATFORM_FEE'");
        if (seat == null || setup == null || platform == null) throw new SQLException("organization products are missing; seed the services first");
        return "{\"seatBaseProductId\":" + seat + ",\"minSeats\":1,\"maxSeatsSetting\":\"enterprise.license.max_seats\",\"setupFeeProductId\":" + setup + ",\"platformFeeProductId\":" + platform + "}";
    }

    private static void insertComponents(Connection c, PlanSpec s, long versionId) throws SQLException {
        int sort = 0;
        for (Comp comp : s.components()) {
            Long product = comp.productCode() == null ? null : find(c, "SELECT id FROM product WHERE code = ?", comp.productCode());
            if (comp.productCode() != null && product == null) throw new SQLException("seed product " + comp.productCode() + " is missing; seed the services first");
            try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO plan_component (plan_version_id, feature_key, role, product_id, allowance_override, limit_overrides_json, default_quantity, max_quantity, component_discount_bp, sort_order, marketing_label) "
                    + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)"
            )) {
                ps.setLong(1, versionId);
                ps.setString(2, comp.feature());
                ps.setString(3, comp.role());
                if (product == null) ps.setNull(4, java.sql.Types.BIGINT);
                else ps.setLong(4, product);
                if (comp.allowanceOverride() == null) ps.setNull(5, java.sql.Types.BIGINT);
                else ps.setLong(5, comp.allowanceOverride());
                ps.setString(6, comp.limitOverridesJson());
                ps.setInt(7, comp.defaultQuantity());
                if (comp.maxQuantity() == null) ps.setNull(8, java.sql.Types.INTEGER);
                else ps.setInt(8, comp.maxQuantity());
                ps.setInt(9, sort++ * 10);
                ps.executeUpdate();
            }
        }
    }

    /** The rendered composition of a version, recorded at publish (the record of what was sold). Deterministic: same input, same bytes. */
    static String snapshot(PlanSpec s) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"planKey\":\"").append(s.planKey()).append("\",\"version\":1,\"audience\":\"").append(s.audience()).append("\",\"intervals\":").append(s.intervalsJson());
        sb.append(",\"aiBudgetCapCents\":").append(s.aiBudgetCapCents()).append(",\"components\":[");
        List<Comp> comps = s.components();
        for (int i = 0; i < comps.size(); i++) {
            Comp comp = comps.get(i);
            if (i > 0) sb.append(',');
            sb.append("{\"featureKey\":\"").append(comp.feature()).append("\",\"role\":\"").append(comp.role()).append('"');
            if (comp.allowanceOverride() != null) sb.append(",\"allowanceOverride\":").append(comp.allowanceOverride());
            if (comp.limitOverridesJson() != null) sb.append(",\"limitOverrides\":").append(comp.limitOverridesJson());
            sb.append('}');
        }
        return sb.append("]}").toString();
    }

    private static Long find(Connection c, String sql, Object... args) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < args.length; i++) ps.setObject(i + 1, args[i]);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getLong(1) : null;
            }
        }
    }

    private static long key(PreparedStatement ps) throws SQLException {
        try (ResultSet rs = ps.getGeneratedKeys()) {
            if (!rs.next()) throw new SQLException("no generated key");
            return rs.getLong(1);
        }
    }

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    @Override
    public String getConfirmationMessage() {
        return "Plans FREE, PRO, AUTOPILOT and ORG_STANDARD (version 1) seeded as compositions of catalog services (no prices)";
    }

    @Override
    public void setUp() {
        // nothing to configure
    }

    @Override
    public void setFileOpener(ResourceAccessor resourceAccessor) {
        // not used
    }

    @Override
    public ValidationErrors validate(Database database) {
        return new ValidationErrors();
    }
}
