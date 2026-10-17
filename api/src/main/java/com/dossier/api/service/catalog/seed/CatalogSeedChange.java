package com.dossier.api.service.catalog.seed;

import com.dossier.api.service.catalog.seed.CatalogSeedData.Dep;
import com.dossier.api.service.catalog.seed.CatalogSeedData.Lim;
import com.dossier.api.service.catalog.seed.CatalogSeedData.Preset;
import com.dossier.api.service.catalog.seed.CatalogSeedData.Prod;
import com.dossier.api.service.catalog.seed.CatalogSeedData.Svc;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import liquibase.change.custom.CustomTaskChange;
import liquibase.database.Database;
import liquibase.database.jvm.JdbcConnection;
import liquibase.exception.CustomChangeException;
import liquibase.exception.ValidationErrors;
import liquibase.resource.ResourceAccessor;

/**
 * The Liquibase seed of the catalog ({@code 20261101040000_sub_backfill.xml}, changeSet {@code sub-seed-services}; story K1.4): inserts the services,
 * secondary limits, dependencies, products and (inactive) presets of {@link CatalogSeedData} through plain JDBC. <b>Idempotent</b>: every row is looked
 * up by its key first and inserted only when absent, so a rerun inserts nothing and an admin's later edit of a seeded row is never overwritten. It never
 * writes a {@code product_price} row: the catalog ships without prices. Runs inside Liquibase, so it uses no Spring bean.
 */
public class CatalogSeedChange implements CustomTaskChange {

    @Override
    public void execute(Database database) throws CustomChangeException {
        try {
            Connection c = ((JdbcConnection) database.getConnection()).getUnderlyingConnection();
            seed(c);
        } catch (SQLException e) {
            throw new CustomChangeException("catalog seed failed: " + e.getMessage(), e);
        }
    }

    /** Seed on {@code c} (the caller owns the transaction). Safe to call any number of times. Returns how many rows it inserted. */
    public static int seed(Connection c) throws SQLException {
        int inserted = 0;
        for (Svc s : CatalogSeedData.SERVICES) inserted += insertService(c, s);
        for (Prod p : CatalogSeedData.PRODUCTS) inserted += insertProduct(c, p);
        for (Lim l : CatalogSeedData.LIMITS) inserted += insertLimit(c, l);
        for (Dep d : CatalogSeedData.DEPENDENCIES) inserted += insertDependency(c, d);
        for (Preset p : CatalogSeedData.PRESETS) inserted += insertPreset(c, p);
        return inserted;
    }

    private static boolean exists(Connection c, String sql, Object... args) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < args.length; i++) ps.setObject(i + 1, args[i]);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    private static int insertService(Connection c, Svc s) throws SQLException {
        if (exists(c, "SELECT 1 FROM feature_definition WHERE feature_key = ?", s.key())) return 0;
        try (PreparedStatement ps = c.prepareStatement(
            "INSERT INTO feature_definition (feature_key, name, description, usage_type, usage_unit, default_allowance, allowance_period, icon_key, active, sort_order, demo_data, created_at, "
                + "audience, category, pool_mode, ai_budget_cents, consumes_ai, reserve_ttl_seconds, stackable, max_quantity, additive, eligibility_json, entitlement_keys_json, limit_key, visibility, catalog_version, updated_at, updated_by) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, NULL, TRUE, ?, FALSE, NOW(6), ?, ?, ?, ?, ?, 900, ?, ?, ?, NULL, ?, ?, ?, 0, NOW(6), 'seed')"
        )) {
            int i = 1;
            ps.setString(i++, s.key());
            ps.setString(i++, s.name());
            ps.setString(i++, s.description());
            ps.setString(i++, s.usageType());
            ps.setString(i++, s.unit());
            ps.setLong(i++, s.allowance());
            ps.setString(i++, s.period());
            ps.setInt(i++, s.sort());
            ps.setString(i++, s.audience());
            ps.setString(i++, s.category());
            ps.setString(i++, s.poolMode());
            ps.setInt(i++, s.aiBudgetCents());
            ps.setBoolean(i++, s.consumesAi());
            ps.setBoolean(i++, s.stackable());
            if (s.maxQuantity() == null) ps.setNull(i++, java.sql.Types.INTEGER);
            else ps.setInt(i++, s.maxQuantity());
            ps.setBoolean(i++, s.additive());
            ps.setString(i++, s.entitlementKeys().isEmpty() ? null : json(s.entitlementKeys()));
            ps.setString(i++, s.limitKey());
            ps.setString(i, s.visibility());
            return ps.executeUpdate();
        }
    }

    private static int insertProduct(Connection c, Prod p) throws SQLException {
        if (exists(c, "SELECT 1 FROM product WHERE code = ?", p.code())) return 0;
        try (PreparedStatement ps = c.prepareStatement(
            "INSERT INTO product (code, name, kind, feature_key, description, tier_rank, active, sort_order, demo_data, created_at, sold_to, stripe_product_id, quantity_basis, role_key, updated_at, updated_by) "
                + "VALUES (?, ?, ?, ?, ?, NULL, TRUE, ?, FALSE, NOW(6), ?, NULL, ?, ?, NOW(6), 'seed')"
        )) {
            int i = 1;
            ps.setString(i++, p.code());
            ps.setString(i++, p.name());
            ps.setString(i++, p.kind());
            ps.setString(i++, p.featureKey());
            ps.setString(i++, p.description());
            ps.setInt(i++, p.sort());
            ps.setString(i++, p.soldTo());
            ps.setString(i++, p.quantityBasis());
            ps.setString(i, p.roleKey());
            return ps.executeUpdate();
        }
    }

    private static int insertLimit(Connection c, Lim l) throws SQLException {
        if (exists(c, "SELECT 1 FROM feature_definition_limit WHERE feature_key = ? AND limit_key = ?", l.feature(), l.limitKey())) return 0;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO feature_definition_limit (feature_key, limit_key, limit_value, period) VALUES (?, ?, ?, ?)")) {
            ps.setString(1, l.feature());
            ps.setString(2, l.limitKey());
            ps.setLong(3, l.value());
            ps.setString(4, l.period());
            return ps.executeUpdate();
        }
    }

    private static int insertDependency(Connection c, Dep d) throws SQLException {
        if (exists(c, "SELECT 1 FROM feature_dependency WHERE feature_key = ? AND requires_feature_key = ? AND kind = ?", d.feature(), d.requires(), d.kind())) return 0;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO feature_dependency (feature_key, requires_feature_key, kind, note, active) VALUES (?, ?, ?, ?, TRUE)")) {
            ps.setString(1, d.feature());
            ps.setString(2, d.requires());
            ps.setString(3, d.kind());
            ps.setString(4, d.note());
            return ps.executeUpdate();
        }
    }

    private static int insertPreset(Connection c, Preset p) throws SQLException {
        if (exists(c, "SELECT 1 FROM license_preset WHERE `key` = ?", p.key())) return 0;
        try (PreparedStatement ps = c.prepareStatement(
            "INSERT INTO license_preset (`key`, name, description, feature_keys_json, mirrors_product_code, plan_key, active, sort_order, catalog_version) VALUES (?, ?, ?, ?, ?, NULL, FALSE, ?, 0)"
        )) {
            ps.setString(1, p.key());
            ps.setString(2, p.name());
            ps.setString(3, p.description());
            ps.setString(4, json(p.features()));
            ps.setString(5, p.mirrorsProductCode());
            ps.setInt(6, p.sort());
            return ps.executeUpdate();
        }
    }

    /** A JSON array of plain strings (keys never contain a quote or a backslash; the seed test asserts it). */
    static String json(List<String> values) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append('"').append(values.get(i)).append('"');
        }
        return sb.append(']').toString();
    }

    @Override
    public String getConfirmationMessage() {
        return "Catalog services, products, limits, dependencies and presets seeded (no prices)";
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
