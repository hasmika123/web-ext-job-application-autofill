package com.dossier.api.service.ent.mkt.streams;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.mkt.MktJobStream;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktJobStreamRepository;
import com.dossier.api.repository.ent.mkt.MktStreamAlertRepository;
import com.dossier.api.repository.ent.mkt.MktStreamRuleRepository;
import com.dossier.api.repository.ent.mkt.MktStreamSyncLogRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Job Streams tables on MySQL (Testcontainers; NOT run on a machine without Docker): the migration applies with its tenant keys, the demo
 * seeder fills Acme with the board's data and Beta with its own, a second run adds nothing, the composite tenant foreign key refuses a child row
 * that points at another tenant's stream, and another tenant's stream id is invisible to the org-scoped lookups and to {@code recordSync}.
 */
@IntegrationTest
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(180)
class MktStreamsIT {

    private static final List<String> TABLES = List.of("mkt_job_stream", "mkt_stream_sync_log", "mkt_stream_alert", "mkt_stream_rule");

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private MktStreamsDemoSeeder seeder;
    @Autowired private OrganizationRepository orgs;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private MktJobStreamRepository streams;
    @Autowired private MktStreamSyncLogRepository logs;
    @Autowired private MktStreamAlertRepository alerts;
    @Autowired private MktStreamRuleRepository rules;
    @Autowired private MktStreamsService service;

    private Long acme;
    private Long beta;

    @BeforeEach
    void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        assertThat(seeder.seed()).isEqualTo(2);
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).map(Organization::getId).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).map(Organization::getId).orElseThrow();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
    }

    @Test
    void everyTableExistsWithAnOrgIdAndATenantForeignKey() {
        for (String t : TABLES) {
            Long cols = jdbc.queryForObject("select count(*) from information_schema.columns where table_schema = database() and table_name = ? and column_name = 'org_id' and is_nullable = 'NO'", Long.class, t);
            assertThat(cols).as(t + ".org_id NOT NULL").isEqualTo(1L);
            Long fk = jdbc.queryForObject("select count(*) from information_schema.key_column_usage where table_schema = database() and table_name = ? and column_name = 'org_id' and referenced_table_name = 'organization'", Long.class, t);
            assertThat(fk).as(t + " FK to organization").isGreaterThanOrEqualTo(1L);
        }
        List<Map<String, Object>> childFks = jdbc.queryForList(
            "select table_name t, constraint_name c, column_name col from information_schema.key_column_usage where table_schema = database() "
                + "and referenced_table_name = 'mkt_job_stream' and table_name in ('mkt_stream_sync_log','mkt_stream_alert') and ordinal_position = 1");
        assertThat(childFks).hasSize(2);
        for (Map<String, Object> row : childFks) assertThat(row.get("col")).as(row.get("t") + " composite FK starts with org_id").isEqualTo("org_id");
    }

    @Test
    void theContractColumnsOfMktJobStreamExist() {
        List<String> cols = jdbc.queryForList("select column_name from information_schema.columns where table_schema = database() and table_name = 'mkt_job_stream'", String.class);
        assertThat(cols).contains("id", "org_id", "source_label", "subtitle", "status", "active", "sync_every_minutes", "keywords", "client_scope", "last_sync_at", "new_openings", "openings_delta_pct", "created_at", "updated_at");
    }

    @Test
    void acmeGetsTheBoardsSixStreamsAndBetaItsOwn() {
        assertThat(streams.countByOrgId(acme)).isEqualTo(6);
        assertThat(streams.countByOrgId(beta)).isEqualTo(3);
        assertThat(logs.countByOrgId(acme)).isEqualTo(6 * 14);
        assertThat(rules.countByOrgId(acme)).isEqualTo(4);
        assertThat(rules.countByOrgId(beta)).isEqualTo(4);
        assertThat(alerts.findByOrgIdAndResolvedAtIsNullOrderByRaisedAtDesc(acme, PageRequest.of(0, 20))).hasSize(4);
        assertThat(alerts.findByOrgIdAndResolvedAtIsNullOrderByRaisedAtDesc(beta, PageRequest.of(0, 20))).isEmpty();
        List<MktJobStream> list = streams.findByOrgIdOrderByCreatedAtAscIdAsc(acme);
        assertThat(list).extracting(MktJobStream::getSourceLabel).containsExactlyInAnyOrder("LinkedIn Jobs", "Indeed", "Dice", "ZipRecruiter", "Client Portal", "Vendor Feed");
        assertThat(list).allMatch(s -> s.getOrgId().equals(acme));
        assertThat(streams.countByOrgIdAndStatusAndCreatedAtLessThan(acme, "ACTIVE", Instant.now().minusSeconds(30L * 86400))).isEqualTo(5); // 6 now, 5 a month ago
    }

    @Test
    void aSecondSeedAddsNothing() {
        long before = streams.countByOrgId(acme) + logs.countByOrgId(acme) + rules.countByOrgId(acme);
        assertThat(seeder.seed()).isZero();
        assertThat(streams.countByOrgId(acme) + logs.countByOrgId(acme) + rules.countByOrgId(acme)).isEqualTo(before);
    }

    @Test
    void aCrossTenantChildRowIsRefusedByTheDatabase() {
        Long acmeStream = streams.findByOrgIdOrderByCreatedAtAscIdAsc(acme).get(0).getId();
        assertThatThrownBy(() -> jdbc.update("insert into mkt_stream_sync_log (org_id, stream_id, synced_at, openings, status) values (?, ?, now(6), 1, 'OK')", beta, acmeStream))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("insert into mkt_stream_alert (org_id, stream_id, severity, title, raised_at) values (?, ?, 'ERROR', 'x', now(6))", beta, acmeStream))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void anotherTenantsStreamIsInvisibleToOrgScopedLookupsAndToRecordSync() {
        Long acmeStream = streams.findByOrgIdOrderByCreatedAtAscIdAsc(acme).get(0).getId();
        assertThat(streams.findByOrgIdAndId(beta, acmeStream)).isEmpty();
        long logsBefore = logs.countByOrgId(acme);
        assertThat(service.recordSync(beta, acmeStream, 99, true, "x", Instant.now())).isFalse();
        assertThat(logs.countByOrgId(acme)).isEqualTo(logsBefore);
        assertThat(logs.countByOrgId(beta)).isEqualTo(3 * 14);
    }

    @Test
    void recordSyncWritesTheLogAndUpdatesTheStream() {
        MktJobStream s = streams.findByOrgIdOrderByCreatedAtAscIdAsc(acme).stream().filter(x -> x.getSourceLabel().equals("Dice")).findFirst().orElseThrow();
        long before = logs.countByOrgId(acme);
        assertThat(service.recordSync(acme, s.getId(), 60, true, "Sync completed", Instant.now())).isTrue();
        assertThat(logs.countByOrgId(acme)).isEqualTo(before + 1);
        MktJobStream after = streams.findByOrgIdAndId(acme, s.getId()).orElseThrow();
        assertThat(after.getNewOpenings()).isEqualTo(60);
        assertThat(after.getOpeningsDeltaPct()).isNotNull();
    }
}
