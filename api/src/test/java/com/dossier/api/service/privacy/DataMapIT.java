package com.dossier.api.service.privacy;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.service.AccountExportService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * The data-map test (REAL-GAPS-C T1.1). It reads the LIVE schema (Liquibase has run) and fails when a table that carries a user or organization
 * reference is not classified in {@link DataMap}, so a new personal table cannot ship without a decision on how it is erased, exported and retained.
 * It also fails on a stale entry (a table or column that no longer exists), and when an export section the map relies on is not in the real export.
 *
 * <p>"A user reference" is any foreign key to {@code jhi_user} or any column named like {@code user_id}, {@code login} or {@code email}; "an organization
 * reference" is {@code org_id}, a {@code ..._org_id} column or a foreign key to {@code organization}. To fix a failure here, add the table to
 * {@code DataMap} (and, if it holds a person's data, to the erasure and the export, or say in the entry why not).
 */
@IntegrationTest
class DataMapIT {

    private static final Pattern USERISH = Pattern.compile("(^|_)user_id$|(^|_)login$|(^|_)email(_|$)");
    private static final Pattern ORGISH = Pattern.compile("(^|_)org_id$");

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private AccountExportService exportService;

    @Autowired
    private List<RetentionTarget> targets;

    private Map<String, List<String>> columns() {
        Map<String, List<String>> by = new LinkedHashMap<>();
        for (Map<String, Object> r : jdbc.queryForList("select table_name t, column_name c from information_schema.columns where table_schema = database() order by table_name, ordinal_position")) {
            by.computeIfAbsent(((String) r.get("t")).toLowerCase(), k -> new ArrayList<>()).add(((String) r.get("c")).toLowerCase());
        }
        return by;
    }

    private Set<String> tablesWithForeignKeyTo(String referenced) {
        Set<String> out = new TreeSet<>();
        for (Map<String, Object> r : jdbc.queryForList(
            "select table_name t from information_schema.key_column_usage where table_schema = database() and referenced_table_name = ?",
            referenced
        )) out.add(((String) r.get("t")).toLowerCase());
        return out;
    }

    @Test
    void everyTableWithAUserOrOrganizationReferenceIsClassified() {
        Map<String, List<String>> cols = columns();
        assertThat(cols).as("the schema was read").hasSizeGreaterThan(150);
        Set<String> fkUser = tablesWithForeignKeyTo("jhi_user");
        Set<String> fkOrg = tablesWithForeignKeyTo("organization");

        List<String> unclassified = new ArrayList<>();
        for (Map.Entry<String, List<String>> t : cols.entrySet()) {
            String table = t.getKey();
            boolean ref = fkUser.contains(table) || fkOrg.contains(table) || t.getValue().stream().anyMatch(c -> USERISH.matcher(c).find() || ORGISH.matcher(c).find());
            if (ref && DataMap.find(table) == null) unclassified.add(table + " " + t.getValue().stream().filter(c -> USERISH.matcher(c).find() || ORGISH.matcher(c).find()).toList());
        }
        assertThat(unclassified)
            .as("these tables hold a user or organization reference but are not in DataMap: decide how each is erased, exported and retained, then add it")
            .isEmpty();
    }

    @Test
    void noEntryNamesATableOrColumnThatIsGone() {
        Map<String, List<String>> cols = columns();
        List<String> stale = new ArrayList<>();
        for (DataMap.Entry e : DataMap.entries().values()) {
            List<String> c = cols.get(e.table());
            if (c == null) {
                stale.add("table " + e.table());
                continue;
            }
            for (DataMap.Col col : e.cols()) if (!c.contains(col.name())) stale.add(e.table() + "." + col.name());
        }
        assertThat(stale).as("entries that no longer match the schema").isEmpty();
    }

    @Test
    void anOwnedTableWithoutAUserColumnIsOnlyAChildOfAnApplication() {
        // an owned table must be countable by its user column (so the purge report sees it), unless it hangs off a parent
        List<String> notCountable = new ArrayList<>();
        for (DataMap.Entry e : DataMap.entries().values()) {
            if (e.cls() != DataClass.USER_OWNED || !e.cols().isEmpty()) continue;
            if (!Set.of("application_event", "application_note").contains(e.table())) notCountable.add(e.table());
        }
        assertThat(notCountable).as("USER_OWNED tables with no user column listed").isEmpty();
    }

    @Test
    void everyExportSectionTheMapReliesOnIsInTheRealExport() {
        Map<String, Object> export = exportService.exportAccount("user");
        Set<String> missing = new TreeSet<>(DataMap.exportSections());
        missing.removeAll(export.keySet());
        assertThat(missing).as("DataMap names export sections the account export does not produce").isEmpty();
    }

    @Test
    void everyRetentionTargetPurgesATableThatIsInTheMapWithTheSameJob() {
        assertThat(targets).hasSizeGreaterThanOrEqualTo(5);
        for (RetentionTarget t : targets) {
            DataMap.Entry e = DataMap.find(t.table());
            assertThat(e).as(t.table()).isNotNull();
            assertThat(e.retentionJob()).as("retention job named by the map for %s", t.table()).isEqualTo(t.job());
        }
    }
}
