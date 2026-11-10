package com.dossier.api.service.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import liquibase.Contexts;
import liquibase.Liquibase;
import liquibase.database.Database;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import liquibase.resource.ClassLoaderResourceAccessor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * K1.2, both landing orders: the four doc-21 catalog tables are shared with the enterprise story X5.2, and whichever changelog runs first creates
 * them while the other is a no-op (MARK_RAN). Each order runs on its own scratch schema of the test MySQL (the real schema is never touched):
 * K1.2 first creates the tables with the exact doc-21 columns and a rerun changes nothing; "X5.2 first" pre-creates them (with a row and an extra
 * column the enterprise version may carry) and the K1.2 changeSets are marked RAN without altering them.
 */
@IntegrationTest
class CatalogTablesPreconditionIT {

    private static final String CHANGELOG = "config/liquibase/changelog/20261101011000_sub_catalog_doc21.xml";
    private static final List<String> IDS = List.of("sub-catalog-limits", "sub-catalog-dependencies", "sub-catalog-presets", "sub-catalog-tiers");
    private static final String K12_FIRST = "sub_k12_first_it";
    private static final String X5_FIRST = "sub_x5_first_it";

    @Autowired private DataSource dataSource;

    private String baseUrl;

    @BeforeEach
    void schemas() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            baseUrl = c.getMetaData().getURL().replaceFirst("(jdbc:mysql://[^/]+/).*", "$1");
        }
        for (String s : List.of(K12_FIRST, X5_FIRST)) {
            exec(null, "DROP DATABASE IF EXISTS " + s, "CREATE DATABASE " + s);
            // the two tables the doc-21 tables point at (the real ones come from the foundation changelog)
            exec(s, "CREATE TABLE feature_definition (feature_key VARCHAR(60) NOT NULL PRIMARY KEY)", "CREATE TABLE product (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY)");
        }
    }

    @AfterEach
    void drop() throws Exception {
        exec(null, "DROP DATABASE IF EXISTS " + K12_FIRST, "DROP DATABASE IF EXISTS " + X5_FIRST);
    }

    private Connection open(String schema) throws Exception {
        String url = baseUrl + (schema == null ? "" : schema) + "?allowPublicKeyRetrieval=true&useSSL=false";
        return DriverManager.getConnection(url, "root", "test");
    }

    private void exec(String schema, String... statements) throws Exception {
        try (Connection c = open(schema); Statement st = c.createStatement()) {
            for (String s : statements) st.execute(s);
        }
    }

    private void runChangelog(String schema) throws Exception {
        try (Connection c = open(schema)) {
            Database db = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(c));
            Liquibase lb = new Liquibase(CHANGELOG, new ClassLoaderResourceAccessor(), db);
            lb.setChangeLogParameter("datetimeType", "datetime(6)");
            lb.update(new Contexts());
        }
    }

    private List<String> columns(String schema, String table) throws Exception {
        List<String> out = new ArrayList<>();
        try (Connection c = open(schema); Statement st = c.createStatement(); ResultSet rs = st.executeQuery(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = '" + schema + "' AND table_name = '" + table + "' ORDER BY ordinal_position")) {
            while (rs.next()) out.add(rs.getString(1));
        }
        return out;
    }

    private Map<String, String> execTypes(String schema) throws Exception {
        Map<String, String> out = new java.util.LinkedHashMap<>();
        try (Connection c = open(schema); Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT id, exectype FROM DATABASECHANGELOG ORDER BY orderexecuted")) {
            while (rs.next()) out.put(rs.getString(1), rs.getString(2));
        }
        return out;
    }

    private long count(String schema, String sql) throws Exception {
        try (Connection c = open(schema); Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    @Test
    void k12FirstCreatesTheDoc21TablesWithTheExactColumnsAndARerunChangesNothing() throws Exception {
        runChangelog(K12_FIRST);
        assertThat(columns(K12_FIRST, "feature_definition_limit")).containsExactly("feature_key", "limit_key", "limit_value", "period");
        assertThat(columns(K12_FIRST, "feature_dependency")).containsExactly("feature_key", "requires_feature_key", "kind", "note", "active");
        assertThat(columns(K12_FIRST, "license_preset")).containsExactly("key", "name", "description", "feature_keys_json", "mirrors_product_code", "plan_key", "active", "sort_order", "catalog_version");
        assertThat(columns(K12_FIRST, "volume_tier")).containsExactly("id", "product_id", "min_licensed_consultants", "pct_off_bp", "active", "effective_from", "effective_until", "catalog_version");
        assertThat(execTypes(K12_FIRST)).containsEntry("sub-catalog-limits", "EXECUTED").containsEntry("sub-catalog-tiers", "EXECUTED");

        exec(K12_FIRST, "INSERT INTO feature_definition (feature_key) VALUES ('a.b')", "INSERT INTO feature_dependency (feature_key, requires_feature_key, kind, note, active) VALUES ('a.b', 'a.c', 'COMMERCIAL', 'n', TRUE)");
        runChangelog(K12_FIRST);
        assertThat(count(K12_FIRST, "SELECT COUNT(*) FROM feature_dependency")).isEqualTo(1L);
        assertThat(count(K12_FIRST, "SELECT COUNT(*) FROM DATABASECHANGELOG")).isEqualTo(4L);
    }

    @Test
    void x5FirstLeavesItsTablesAloneAndTheK12ChangeSetsAreMarkedRan() throws Exception {
        exec(
            X5_FIRST,
            "CREATE TABLE feature_definition_limit (feature_key VARCHAR(60) NOT NULL, limit_key VARCHAR(40) NOT NULL, limit_value BIGINT NOT NULL, period VARCHAR(8) NOT NULL, extra_x5 INT NULL, PRIMARY KEY (feature_key, limit_key))",
            "CREATE TABLE feature_dependency (feature_key VARCHAR(60) NOT NULL, requires_feature_key VARCHAR(60) NOT NULL, kind VARCHAR(12) NOT NULL, note VARCHAR(200), active BOOLEAN NOT NULL DEFAULT TRUE, PRIMARY KEY (feature_key, requires_feature_key, kind))",
            "CREATE TABLE license_preset (`key` VARCHAR(40) NOT NULL PRIMARY KEY, name VARCHAR(80) NOT NULL, description VARCHAR(500), feature_keys_json JSON NOT NULL, mirrors_product_code VARCHAR(40), plan_key VARCHAR(40), active BOOLEAN NOT NULL DEFAULT FALSE, sort_order INT NOT NULL DEFAULT 0, catalog_version INT NOT NULL DEFAULT 0)",
            "CREATE TABLE volume_tier (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, product_id BIGINT NULL, min_licensed_consultants INT NOT NULL, pct_off_bp INT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, effective_from DATETIME(6) NOT NULL, effective_until DATETIME(6) NULL, catalog_version INT NOT NULL DEFAULT 0)",
            "INSERT INTO feature_dependency (feature_key, requires_feature_key, kind, note, active) VALUES ('a.b', 'a.c', 'TECHNICAL', 'x5 row', TRUE)"
        );
        runChangelog(X5_FIRST);
        Map<String, String> types = execTypes(X5_FIRST);
        for (String id : IDS) assertThat(types).as(id).containsEntry(id, "MARK_RAN");
        assertThat(columns(X5_FIRST, "feature_definition_limit")).contains("extra_x5");
        assertThat(count(X5_FIRST, "SELECT COUNT(*) FROM feature_dependency WHERE note = 'x5 row'")).isEqualTo(1L);
    }
}
