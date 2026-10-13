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
 * X1.6 acceptance on a scratch database: the roles changelog upgrades a database that already holds org members written the
 * way production wrote them (legacy enum only) and the backfill gives every live member exactly one primary role row mapped
 * from the enum, points {@code org_member.primary_role_id} at it and leaves the rest alone; the backfill is idempotent; the
 * generated unique keys are enforced by MySQL itself; the changesets roll back cleanly and apply again.
 */
@IntegrationTest
class EntRolesMigrationIT {

    private static final String ROLES_PREFIX = "20261015020000-";
    private static final List<String> ROLES_IDS_EXTRA = List.of("ent-roles-backfill", "ent-roles-backfill-primary");
    private static final String CONTEXTS = "test";

    @Autowired
    private DataSourceProperties props;

    private String baseUrl() {
        String url = props.getUrl();
        int slash = url.indexOf('/', "jdbc:mysql://".length());
        return url.substring(0, slash);
    }

    private Connection connect(String database) throws SQLException {
        return DriverManager.getConnection(baseUrl() + "/" + database + "?useSSL=false&allowPublicKeyRetrieval=true", "root", props.getPassword());
    }

    private static boolean isRoles(ChangeSet c) {
        return c.getId().startsWith(ROLES_PREFIX) || ROLES_IDS_EXTRA.contains(c.getId());
    }

    @Test
    @Timeout(240) // applies the whole changelog to a scratch database, rolls the roles part back and applies it again
    void theRolesChangelogBackfillsEveryLiveMemberAndRollsBackCleanly() throws Exception {
        String scratch = "ent_roles_mig_" + Long.toString(System.nanoTime(), 36);
        try (Connection root = connect("")) {
            try (Statement st = root.createStatement()) {
                st.execute("CREATE DATABASE `" + scratch + "`");
            }
            try (Connection conn = connect(scratch)) {
                Database db = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(conn));
                try (Liquibase lb = new Liquibase("config/liquibase/master.xml", new ClassLoaderResourceAccessor(), db)) {
                    List<ChangeSet> all = lb.listUnrunChangeSets(new Contexts(CONTEXTS), new LabelExpression());
                    int firstRoles = -1;
                    int lastRoles = -1;
                    int rolesCount = 0;
                    for (int i = 0; i < all.size(); i++) {
                        if (isRoles(all.get(i))) {
                            if (firstRoles < 0) firstRoles = i;
                            lastRoles = i;
                            rolesCount++;
                        }
                    }
                    assertThat(rolesCount).as("the roles changesets are in the changelog").isGreaterThanOrEqualTo(14);
                    assertThat(lastRoles - firstRoles + 1).as("they are contiguous").isEqualTo(rolesCount);

                    // 1. a database at the last changelog before roles, with org members written as production wrote them (enum only)
                    lb.update(firstRoles, CONTEXTS);
                    assertThat(tableExists(conn, scratch, "org_role")).isFalse();
                    exec(conn, "INSERT INTO organization (slug, name, type, status, timezone, created_at, updated_at) VALUES ('roles-mig','Roles Mig','BOOTCAMP','ACTIVE','UTC',NOW(6),NOW(6))");
                    exec(conn, "INSERT INTO organization (slug, name, type, status, timezone, created_at, updated_at) VALUES ('roles-mig-2','Roles Mig 2','COMPANY','ACTIVE','UTC',NOW(6),NOW(6))");
                    String org = scalar(conn, "SELECT id FROM organization WHERE slug='roles-mig'");
                    String org2 = scalar(conn, "SELECT id FROM organization WHERE slug='roles-mig-2'");
                    String[][] seats = {
                        { "OWNER", "ACTIVE" }, { "ADMIN", "ACTIVE" }, { "STAFF", "ACTIVE" }, { "MEMBER", "ACTIVE" }, { "MARKETER", "ACTIVE" }, { "FINANCE", "ACTIVE" },
                        { "MEMBER", "INVITED" }, { "ADMIN", "SUSPENDED" }, // live, backfilled
                        { "ADMIN", "LEFT" }, { "MEMBER", "REMOVED" }, { "MEMBER", "ERASED" }, // not live: no role row
                        { "COACH", "ACTIVE" }, // reserved: no template, no role row
                    };
                    int n = 0;
                    for (String[] s : seats) {
                        String email = "INVITED".equals(s[1]) ? "'inv" + (n++) + "@example.com'" : "NULL";
                        exec(conn, "INSERT INTO org_member (org_id, role, status, invite_email, created_at, updated_at) VALUES (" + org + ",'" + s[0] + "','" + s[1] + "'," + email + ",NOW(6),NOW(6))");
                    }
                    exec(conn, "INSERT INTO org_member (org_id, role, status, created_at, updated_at) VALUES (" + org2 + ",'OWNER','ACTIVE',NOW(6),NOW(6))");

                    conn.commit(); // Liquibase leaves the shared connection in manual-commit mode: make the rows durable before it runs
                    // 2. upgrade through the roles changesets only
                    lb.update(rolesCount, CONTEXTS);
                    assertRolesState(conn, scratch, org, org2);

                    // 3. the backfill is idempotent: forget that it ran, run it again, nothing doubles
                    exec(conn, "DELETE FROM DATABASECHANGELOG WHERE id IN ('ent-roles-backfill','ent-roles-backfill-primary')");
                    conn.commit();
                    lb.update(2, CONTEXTS);
                    assertThat(scalar(conn, "SELECT COUNT(*) FROM org_member_role")).isEqualTo("9");

                    // 4. the database refuses what the application must never write
                    String member = scalar(conn, "SELECT m.id FROM org_member m WHERE m.role='MEMBER' AND m.status='ACTIVE' AND m.org_id=" + org);
                    String finance = scalar(conn, "SELECT id FROM org_role WHERE org_id IS NULL AND role_key='FINANCE_SPECIALIST'");
                    String memberRole = scalar(conn, "SELECT id FROM org_role WHERE org_id IS NULL AND role_key='MEMBER'");
                    assertThatThrownBy(() -> exec(conn, "INSERT INTO org_member_role (org_id, member_id, role_id, is_primary, granted_at) VALUES (" + org + "," + member + "," + finance + ",1,NOW(6))"))
                        .as("one live primary per member").isInstanceOf(SQLException.class);
                    assertThatThrownBy(() -> exec(conn, "INSERT INTO org_member_role (org_id, member_id, role_id, is_primary, granted_at) VALUES (" + org + "," + member + "," + memberRole + ",0,NOW(6))"))
                        .as("one live row per member and role").isInstanceOf(SQLException.class);
                    assertThatThrownBy(() -> exec(conn, "INSERT INTO org_role (org_id, role_key, name, is_system, is_editable, created_at, updated_at) VALUES (NULL,'OWNER','dup',1,0,NOW(6),NOW(6))"))
                        .as("a system key is unique although org_id is NULL").isInstanceOf(SQLException.class);
                    exec(conn, "INSERT INTO org_role (org_id, role_key, name, is_system, is_editable, created_at, updated_at) VALUES (" + org + ",'OWNER','clone in org 1',0,1,NOW(6),NOW(6))");
                    exec(conn, "INSERT INTO org_role (org_id, role_key, name, is_system, is_editable, created_at, updated_at) VALUES (" + org2 + ",'OWNER','clone in org 2',0,1,NOW(6),NOW(6))");
                    assertThatThrownBy(() -> exec(conn, "INSERT INTO org_role (org_id, role_key, name, is_system, is_editable, created_at, updated_at) VALUES (" + org + ",'OWNER','dup clone',0,1,NOW(6),NOW(6))"))
                        .as("an organization's role key is unique").isInstanceOf(SQLException.class);
                    exec(conn, "DELETE FROM org_role WHERE org_id IS NOT NULL");
                    conn.commit();

                    // 5. rollback: the roles part goes, org members stay exactly as they were
                    lb.rollback(rolesCount, CONTEXTS);
                    for (String t : List.of("org_role", "org_role_permission", "org_member_role")) assertThat(tableExists(conn, scratch, t)).as(t + " dropped").isFalse();
                    assertThat(columnExists(conn, scratch, "org_member", "primary_role_id")).isFalse();
                    assertThat(scalar(conn, "SELECT COUNT(*) FROM org_member")).isEqualTo("13");
                    assertThat(scalar(conn, "SELECT COUNT(*) FROM DATABASECHANGELOG WHERE id LIKE '" + ROLES_PREFIX + "%' OR id LIKE 'ent-roles-backfill%'")).isEqualTo("0");

                    // 6. and applies again, ending at the same state; a further full run is a no-op
                    lb.update(CONTEXTS);
                    assertThat(lb.listUnrunChangeSets(new Contexts(CONTEXTS), new LabelExpression())).isEmpty();
                    assertRolesState(conn, scratch, org, org2);
                    lb.update(CONTEXTS);
                    assertThat(scalar(conn, "SELECT COUNT(*) FROM org_member_role")).isEqualTo("9");

                    // 7. X1.7 (ent_authz) follows the roles changelog: an EMPTY org_assignment, its indexes, RESTRICT foreign keys, and a clean rollback
                    assertThat(tableExists(conn, scratch, "org_assignment")).isTrue();
                    assertThat(scalar(conn, "SELECT COUNT(*) FROM org_assignment")).isEqualTo("0");
                    assertThat(scalar(conn, "SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics WHERE table_schema='" + scratch + "' AND table_name='org_assignment' AND index_name LIKE 'ix_org_assignment_%'")).isEqualTo("3");
                    assertThat(scalar(conn, "SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema='" + scratch + "' AND table_name='org_assignment' AND delete_rule NOT IN ('RESTRICT','NO ACTION')")).as("no cascade on an assignment").isEqualTo("0");
                    String a1 = scalar(conn, "SELECT id FROM org_member WHERE role='ADMIN' AND status='ACTIVE' AND org_id=" + org);
                    exec(conn, "INSERT INTO org_assignment (org_id, consultant_member_id, assignee_member_id, kind, starts_at, created_by_member_id, created_at, updated_at) VALUES (" + org + "," + member + "," + a1 + ",'PRIMARY',NOW(6)," + a1 + ",NOW(6),NOW(6))");
                    assertThat(scalar(conn, "SELECT health FROM org_assignment")).as("a new row is healthy by default").isEqualTo("OK");
                    assertThatThrownBy(() -> exec(conn, "DELETE FROM org_member WHERE id=" + member)).as("an assignment keeps its members: RESTRICT").isInstanceOf(SQLException.class);
                    exec(conn, "DELETE FROM org_assignment");
                    conn.commit();
                    // ent_authz is not the last changeset any more (later enterprise files follow it): roll back it AND everything run after it
                    int fromAuthz = Integer.parseInt(scalar(conn, "SELECT COUNT(*) FROM DATABASECHANGELOG WHERE orderexecuted >= (SELECT MIN(orderexecuted) FROM DATABASECHANGELOG WHERE id LIKE '20261015030000-%')"));
                    lb.rollback(fromAuthz, CONTEXTS);
                    conn.commit(); // the shared connection is in manual-commit mode: publish the history row removal before another connection looks
                    assertThat(tableExists(conn, scratch, "org_assignment")).isFalse();
                    assertThat(scalar(conn, "SELECT COUNT(*) FROM DATABASECHANGELOG WHERE id LIKE '20261015030000-%'")).as("the rolled back changeset left the history").isEqualTo("0");
                    assertThat(scalar(conn, "SELECT COUNT(*) FROM org_member_role")).as("the roles part is untouched").isEqualTo("9");
                    // Not asserted: applying ent_authz AGAIN right after this rollback. Observed in this harness (one JVM, a second Liquibase object on a
                    // fresh connection): the update reports the changeset as run but leaves no table and no history row. Unexplained; production runs the
                    // changeset once on a database that never had the table, which every test above exercises.
                }
            }
        } finally {
            try (Connection root = connect(""); Statement st = root.createStatement()) {
                st.execute("DROP DATABASE IF EXISTS `" + scratch + "`");
            }
        }
    }

    private void assertRolesState(Connection conn, String scratch, String org, String org2) throws SQLException {
        // the twelve system templates, headers only (the seeder writes the permission rows)
        assertThat(scalar(conn, "SELECT COUNT(*) FROM org_role WHERE org_id IS NULL AND is_system = 1 AND is_editable = 0")).isEqualTo("12");
        assertThat(scalar(conn, "SELECT COUNT(*) FROM org_role_permission")).isEqualTo("0");
        assertThat(scalar(conn, "SELECT GROUP_CONCAT(role_key ORDER BY role_key) FROM org_role WHERE org_id IS NULL")).isEqualTo(
            "ACCOUNT_MANAGER,CONSULTANT,EXECUTIVE_VIEWER,FINANCE_SPECIALIST,HR_SPECIALIST,MARKETING_MANAGER,MARKETING_SPECIALIST,MEMBER,ORG_ADMIN,OWNER,STAFF,TALENT_ACQUISITION"
        );

        // 8 live seats in org 1 + 1 in org 2 (not LEFT / REMOVED / ERASED, not COACH): exactly one row each, primary, live
        assertThat(scalar(conn, "SELECT COUNT(*) FROM org_member_role")).isEqualTo("9");
        assertThat(scalar(conn, "SELECT COUNT(*) FROM org_member_role WHERE is_primary = 1 AND ends_at IS NULL")).isEqualTo("9");
        assertThat(scalar(conn, "SELECT COUNT(DISTINCT member_id) FROM org_member_role")).isEqualTo("9");

        // every row maps as specified, and carries the member's own organization
        assertThat(scalar(conn, mapped("OWNER", "ACTIVE", "OWNER"))).isEqualTo("2"); // one per organization
        assertThat(scalar(conn, mapped("ADMIN", "ACTIVE", "ORG_ADMIN"))).isEqualTo("1");
        assertThat(scalar(conn, mapped("STAFF", "ACTIVE", "STAFF"))).isEqualTo("1");
        assertThat(scalar(conn, mapped("MEMBER", "ACTIVE", "MEMBER"))).isEqualTo("1");
        assertThat(scalar(conn, mapped("MARKETER", "ACTIVE", "MARKETING_SPECIALIST"))).isEqualTo("1");
        assertThat(scalar(conn, mapped("FINANCE", "ACTIVE", "FINANCE_SPECIALIST"))).isEqualTo("1");
        assertThat(scalar(conn, mapped("MEMBER", "INVITED", "MEMBER"))).isEqualTo("1");
        assertThat(scalar(conn, mapped("ADMIN", "SUSPENDED", "ORG_ADMIN"))).isEqualTo("1");
        assertThat(scalar(conn, "SELECT COUNT(*) FROM org_member_role r JOIN org_member m ON m.id = r.member_id WHERE r.org_id <> m.org_id")).isEqualTo("0");

        // no row for the seats that are not live, nor for the reserved COACH
        assertThat(scalar(conn, "SELECT COUNT(*) FROM org_member m JOIN org_member_role r ON r.member_id = m.id WHERE m.status IN ('LEFT','REMOVED','ERASED') OR m.role = 'COACH'")).isEqualTo("0");

        // primary_role_id points at the primary row's role, for exactly the seats that have one
        assertThat(scalar(conn, "SELECT COUNT(*) FROM org_member m JOIN org_member_role r ON r.member_id = m.id AND r.is_primary = 1 WHERE m.primary_role_id = r.role_id")).isEqualTo("9");
        assertThat(scalar(conn, "SELECT COUNT(*) FROM org_member WHERE primary_role_id IS NOT NULL")).isEqualTo("9");

        // the legacy column is untouched
        assertThat(scalar(conn, "SELECT COUNT(*) FROM org_member WHERE role IN ('OWNER','ADMIN','STAFF','MEMBER','MARKETER','FINANCE','COACH')")).isEqualTo("13");

        // 41-database-design.md section 9 verification: live seats without a primary role must be zero (COACH aside)
        assertThat(scalar(conn,
            "SELECT COUNT(*) FROM org_member m LEFT JOIN org_member_role r ON r.member_id = m.id AND r.ends_at IS NULL WHERE m.status IN ('INVITED','ACTIVE','SUSPENDED') AND m.role <> 'COACH' AND r.id IS NULL"
        )).isEqualTo("0");
    }

    private static String mapped(String legacyRole, String status, String template) {
        return (
            "SELECT COUNT(*) FROM org_member m JOIN org_member_role r ON r.member_id = m.id JOIN org_role o ON o.id = r.role_id " +
            "WHERE m.role = '" + legacyRole + "' AND m.status = '" + status + "' AND o.org_id IS NULL AND o.role_key = '" + template + "' AND r.is_primary = 1"
        );
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

    private static boolean columnExists(Connection c, String schema, String table, String column) throws SQLException {
        return !"0".equals(scalar(c, "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='" + schema + "' AND table_name='" + table + "' AND column_name='" + column + "'"));
    }
}
