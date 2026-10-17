package com.dossier.api.service.privacy;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The data map's own consistency (no database): the schema comparison is {@code DataMapIT}. */
class DataMapTest {

    private static final List<RetentionTarget> TARGETS = List.of(
        new RetentionTargets.AdminAudit(null),
        new RetentionTargets.RefreshTokens(null),
        new RetentionTargets.AiCalls(null),
        new RetentionTargets.BugReports(null),
        new RetentionTargets.DeletionReports(null)
    );

    @Test
    void everyEntryStatesWhatHappensOnErasure() {
        for (DataMap.Entry e : DataMap.entries().values()) {
            assertThat(e.erasure()).as("erasure of %s", e.table()).isNotBlank();
            assertThat(e.table()).isEqualTo(e.table().toLowerCase());
        }
    }

    @Test
    void everyUserOwnedTableIsExportedOrSaysWhyNot() {
        for (DataMap.Entry e : DataMap.entries().values()) {
            if (e.cls() != DataClass.USER_OWNED) continue;
            boolean exported = e.exportSection() != null && !e.exportSection().isBlank();
            boolean excused = e.exportNote() != null && !e.exportNote().isBlank();
            assertThat(exported || excused).as("%s must name its export section or say why it is not exported", e.table()).isTrue();
        }
    }

    @Test
    void aTableWithADirectUserColumnHasOneOfThePersonClasses() {
        for (DataMap.Entry e : DataMap.countable()) {
            assertThat(e.cls()).as(e.table()).isIn(DataClass.USER_OWNED, DataClass.USER_ANONYMISED, DataClass.EPHEMERAL);
        }
    }

    @Test
    void retentionJobsAndTheirTablesAgree() {
        Map<String, DataMap.Entry> map = DataMap.entries();
        for (RetentionTarget t : TARGETS) {
            DataMap.Entry e = map.get(t.table());
            assertThat(e).as("the data map lists %s", t.table()).isNotNull();
            assertThat(e.retentionJob()).as("retention job of %s", t.table()).isEqualTo(t.job());
        }
        for (DataMap.Entry e : map.values()) {
            if (e.retentionJob() == null) continue;
            assertThat(TARGETS).as("a target for %s", e.retentionJob()).anyMatch(t -> t.job().equals(e.retentionJob()) && t.table().equals(e.table()));
        }
    }

    @Test
    void theTablesThisSprintAddedAreClassified() {
        for (String t : List.of("job_lease", "retention_run", "account_deletion_request", "account_deletion_report", "data_export_job", "terms_acceptance")) {
            assertThat(DataMap.find(t)).as(t).isNotNull();
        }
    }
}
