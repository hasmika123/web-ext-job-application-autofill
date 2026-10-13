package com.dossier.api.repository.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import liquibase.Contexts;
import liquibase.LabelExpression;
import liquibase.Liquibase;
import liquibase.changelog.ChangeSet;
import liquibase.database.Database;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import liquibase.resource.ClassLoaderResourceAccessor;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;

/**
 * X1.2 acceptance: "the changelog runs clean on an empty DB and on a DB at the last existing changelog". A scratch database
 * is created next to the test one; the whole changelog is applied EXCEPT the tenancy file (a database exactly as production
 * is today), rows are written the way production wrote them, then the tenancy file is applied: nothing is lost, every new
 * column takes its "behaves as before" default, and running the changelog again is a no-op. Dropped again at the end.
 */
@IntegrationTest
class EntTenancyMigrationIT {

    private static final String TENANCY_PREFIX = "20261015010000-";
    private static final String CONTEXTS = "test";

    @Autowired
    private DataSourceProperties props;

    private String baseUrl() {
        String url = props.getUrl(); // jdbc:mysql://host:port/dossierApi?...
        int slash = url.indexOf('/', "jdbc:mysql://".length());
        return url.substring(0, slash);
    }

    private Connection connect(String database) throws SQLException {
        String url = baseUrl() + "/" + database + "?useSSL=false&allowPublicKeyRetrieval=true";
        return DriverManager.getConnection(url, "root", props.getPassword());
    }

    @Test
    @Timeout(120) // applies the whole changelog twice to a scratch database
    void theTenancyChangelogUpgradesADatabaseAtThePreviousChangelogAndRunsCleanOnAnEmptyOne() throws Exception {
        String scratch = "ent_mig_" + Long.toString(System.nanoTime(), 36);
        try (Connection root = connect("")) {
            try (Statement st = root.createStatement()) {
                st.execute("CREATE DATABASE `" + scratch + "`");
            }
            try (Connection conn = connect(scratch)) {
                Database db = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(conn));
                try (Liquibase lb = new Liquibase("config/liquibase/master.xml", new ClassLoaderResourceAccessor(), db)) {
                    List<ChangeSet> all = lb.listUnrunChangeSets(new Contexts(CONTEXTS), new LabelExpression());
                    long tenancy = all.stream().filter(c -> c.getId().startsWith(TENANCY_PREFIX)).count();
                    assertThat(tenancy).as("the tenancy changesets are in the changelog").isGreaterThanOrEqualTo(6);

                    // 1. a database at the last existing changelog, with data written the way production wrote it
                    lb.update((int) (all.size() - tenancy), CONTEXTS);
                    assertThat(tableExists(conn, scratch, "org_hostname")).isFalse();
                    assertThat(columnType(conn, scratch, "organization", "type")).isEqualTo("varchar(20)");
                    exec(conn, "INSERT INTO organization (slug, name, type, status, timezone, created_at, updated_at) VALUES ('mig-org','Mig Org','BOOTCAMP','ACTIVE','UTC',NOW(6),NOW(6))");
                    exec(conn, "INSERT INTO org_audit_event (org_id, actor_login, action, target_type, created_at) SELECT id, 'admin', 'ORG_CREATE', 'ORG', NOW(6) FROM organization WHERE slug='mig-org'");

                    // 2. upgrade
                    lb.update(CONTEXTS);
                    assertThat(lb.listUnrunChangeSets(new Contexts(CONTEXTS), new LabelExpression())).as("nothing left to run").isEmpty();

                    // nothing lost; new columns behave as before
                    assertThat(scalar(conn, "SELECT type FROM organization WHERE slug='mig-org'")).isEqualTo("BOOTCAMP");
                    assertThat(scalar(conn, "SELECT subdomain_enabled FROM organization WHERE slug='mig-org'")).isEqualTo("0");
                    assertThat(scalar(conn, "SELECT config_version FROM organization WHERE slug='mig-org'")).isEqualTo("0");
                    assertThat(scalar(conn, "SELECT subdomain FROM organization WHERE slug='mig-org'")).isNull();
                    assertThat(scalar(conn, "SELECT display_name FROM organization WHERE slug='mig-org'")).isNull();
                    assertThat(scalar(conn, "SELECT risk FROM org_audit_event WHERE action='ORG_CREATE'")).isEqualTo("LOW");
                    assertThat(scalar(conn, "SELECT hostname_id FROM org_audit_event WHERE action='ORG_CREATE'")).isNull();
                    assertThat(scalar(conn, "SELECT beneficiary_login FROM org_audit_event WHERE action='ORG_CREATE'")).isNull();

                    // the widened column kept NOT NULL and takes the new 21-character value
                    assertThat(columnType(conn, scratch, "organization", "type")).isEqualTo("varchar(40)");
                    assertThat(scalar(conn, "SELECT is_nullable FROM information_schema.columns WHERE table_schema='" + scratch + "' AND table_name='organization' AND column_name='type'")).isEqualTo("NO");
                    exec(conn, "INSERT INTO organization (slug, name, type, status, timezone, created_at, updated_at) VALUES ('mig-ps','Mig PS','PROFESSIONAL_SERVICES','ACTIVE','UTC',NOW(6),NOW(6))");
                    assertThatThrownBy(() -> exec(conn, "INSERT INTO organization (slug, name, status, timezone, created_at, updated_at) VALUES ('mig-null','x','ACTIVE','UTC',NOW(6),NOW(6))"))
                        .as("organization.type is still NOT NULL").isInstanceOf(SQLException.class);

                    // the three new tables exist and the generated keys are enforced by the database itself
                    for (String table : List.of("org_hostname", "org_branding", "org_setting")) assertThat(tableExists(conn, scratch, table)).as(table).isTrue();
                    String orgId = scalar(conn, "SELECT id FROM organization WHERE slug='mig-org'");
                    exec(conn, "INSERT INTO org_hostname (org_id, hostname, kind, status, is_primary, cert_state, created_at, updated_at) VALUES (" + orgId + ",'careers.mig.com','CUSTOM','ACTIVE',1,'NONE',NOW(6),NOW(6))");
                    assertThatThrownBy(() -> exec(conn, "INSERT INTO org_hostname (org_id, hostname, kind, status, is_primary, cert_state, created_at, updated_at) VALUES (" + orgId + ",'careers.mig.com','CUSTOM','PENDING',0,'NONE',NOW(6),NOW(6))"))
                        .as("one live claim per hostname").isInstanceOf(SQLException.class);
                    assertThatThrownBy(() -> exec(conn, "INSERT INTO org_hostname (org_id, hostname, kind, status, is_primary, cert_state, created_at, updated_at) VALUES (" + orgId + ",'two.mig.com','CUSTOM','ACTIVE',1,'NONE',NOW(6),NOW(6))"))
                        .as("one primary per org").isInstanceOf(SQLException.class);

                    // 3. a second run of the whole changelog is a no-op
                    lb.update(CONTEXTS);
                    assertThat(scalar(conn, "SELECT COUNT(*) FROM DATABASECHANGELOG WHERE id LIKE '" + TENANCY_PREFIX + "%'")).isEqualTo(String.valueOf(tenancy));
                }
            }
        } finally {
            try (Connection root = connect(""); Statement st = root.createStatement()) {
                st.execute("DROP DATABASE IF EXISTS `" + scratch + "`");
            }
        }
    }

    private static void exec(Connection c, String sql) throws SQLException {
        try (Statement st = c.createStatement()) {
            st.execute(sql);
        }
    }

    private static String scalar(Connection c, String sql) throws SQLException {
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            return rs.next() ? rs.getString(1) : null;
        }
    }

    private static boolean tableExists(Connection c, String schema, String table) throws SQLException {
        return !"0".equals(scalar(c, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='" + schema + "' AND table_name='" + table + "'"));
    }

    private static String columnType(Connection c, String schema, String table, String column) throws SQLException {
        return scalar(c, "SELECT column_type FROM information_schema.columns WHERE table_schema='" + schema + "' AND table_name='" + table + "' AND column_name='" + column + "'");
    }
}
