package com.dossier.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * The subscription module's changelogs (docs/subscriptions/08-data-model.md, rule R1 of 41-database-design.md) are additive: they only create
 * tables, add columns, indexes and constraints, and seed rows. No drop, rename, type change or destructive SQL outside a {@code <rollback>}
 * block; every changeSet is identified and guarded by a precondition so a rerun, or the enterprise changelog landing first, is a no-op; and
 * every file is registered in {@code master.xml}.
 */
class LiquibaseAdditiveTest {

    private static final Path CHANGELOGS = Path.of("src", "main", "resources", "config", "liquibase", "changelog");
    private static final Path MASTER = Path.of("src", "main", "resources", "config", "liquibase", "master.xml");

    /** The module's changelog files: {@code <timestamp>_sub_<name>.xml}. */
    private static List<Path> moduleChangelogs() throws IOException {
        try (Stream<Path> files = Files.list(CHANGELOGS)) {
            return files.filter(p -> p.getFileName().toString().matches("\\d{14}_sub_[a-z0-9_]+\\.xml")).sorted().toList();
        }
    }

    private static String stripCommentsAndRollbacks(String xml) {
        return xml.replaceAll("(?s)<!--.*?-->", "").replaceAll("(?s)<rollback>.*?</rollback>", "").replaceAll("<rollback\\s*/>", "");
    }

    @Test
    void thereIsAtLeastOneModuleChangelogAndEachIsRegisteredInMaster() throws IOException {
        List<Path> files = moduleChangelogs();
        assertThat(files).isNotEmpty();
        String master = Files.readString(MASTER, StandardCharsets.UTF_8);
        for (Path f : files) assertThat(master).as("%s is included in master.xml", f.getFileName()).contains("changelog/" + f.getFileName());
    }

    @Test
    void noDropRenameOrTypeChangeOutsideARollback() throws IOException {
        List<String> forbidden = List.of(
            "dropTable", "dropColumn", "renameTable", "renameColumn", "modifyDataType", "dropIndex", "dropForeignKeyConstraint", "dropPrimaryKey",
            "dropUniqueConstraint", "dropNotNullConstraint", "dropView", "dropDefaultValue", "delete"
        );
        Pattern sql = Pattern.compile("(?is)\\b(drop\\s+(table|column|index|constraint|foreign)|rename\\s+(table|column|to)|modify\\s+column|change\\s+column|truncate)\\b");
        for (Path f : moduleChangelogs()) {
            String xml = stripCommentsAndRollbacks(Files.readString(f, StandardCharsets.UTF_8));
            for (String tag : forbidden) assertThat(xml).as("%s uses %s", f.getFileName(), tag).doesNotContain("<" + tag);
            Matcher m = sql.matcher(xml);
            String hit = m.find() ? m.group() : "";
            assertThat(hit).as("%s has destructive SQL", f.getFileName()).isEmpty();
        }
    }

    @Test
    void everyChangeSetHasAnIdAnAuthorAndIsGuardedByAPrecondition() throws IOException {
        Pattern changeSet = Pattern.compile("(?s)<changeSet\\b([^>]*)>(.*?)</changeSet>");
        List<String> ids = new ArrayList<>();
        for (Path f : moduleChangelogs()) {
            String xml = stripCommentsAndRollbacks(Files.readString(f, StandardCharsets.UTF_8));
            Matcher m = changeSet.matcher(xml);
            int count = 0;
            while (m.find()) {
                count++;
                String attrs = m.group(1);
                Matcher id = Pattern.compile("\\bid=\"([^\"]+)\"").matcher(attrs);
                assertThat(id.find()).as("changeSet id in %s", f.getFileName()).isTrue();
                assertThat(attrs).as("author of %s", id.group(1)).contains("author=\"");
                assertThat(ids).as("changeSet id %s is unique", id.group(1)).doesNotContain(id.group(1));
                ids.add(id.group(1));
                String body = m.group(2);
                boolean guarded = body.contains("<preConditions") && body.contains("onFail=\"MARK_RAN\"");
                boolean idempotentSeed = body.contains("<customChange");
                assertThat(guarded || idempotentSeed).as("changeSet %s is guarded (MARK_RAN) or an idempotent customChange", id.group(1)).isTrue();
            }
            assertThat(count).as("changeSets in %s", f.getFileName()).isPositive();
        }
    }
}
