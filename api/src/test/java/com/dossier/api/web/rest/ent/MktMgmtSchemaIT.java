package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing Manager tables on MySQL (MM-01): the migration applies (every table has its tenant keys), the generated keys allow ONE open request per
 * subject and kind and ONE live escalation per rule and subject, the composite tenant foreign key refuses a row that points at another tenant's parent, an
 * escalation's trail goes with it, and no column could hold sensitive PII (CLAUDE.md: never collected).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class MktMgmtSchemaIT extends MemberItSupport {

    private static final List<String> TABLES = List.of("mkt_approval_request", "mkt_escalation", "mkt_escalation_event");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ConsultantProfileRepository consultants;

    private ConsultantProfile consultant(com.dossier.api.domain.org.Organization org, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.org");
        c.setStatus("ACTIVE");
        c.setJobTitle("Engineer");
        c.setCreatedAt(Instant.now());
        return consultants.saveAndFlush(c);
    }

    private long q(String sql, Object... args) {
        Long v = jdbc.queryForObject(sql, Long.class, args);
        return v == null ? 0 : v;
    }

    private void approval(Long orgId, Long consultantId, Long requester, String status, long subjectId, String kind) {
        jdbc.update(
            "insert into mkt_approval_request (org_id, kind, subject_type, subject_id, consultant_id, requested_by_member_id, requested_at, title, status, expires_at, created_at, updated_at) "
                + "values (?, ?, 'MKT_OPPORTUNITY', ?, ?, ?, now(6), 'Anika to Acme', ?, date_add(now(6), interval 7 day), now(6), now(6))",
            orgId, kind, subjectId, consultantId, requester, status
        );
    }

    private void escalation(Long orgId, String ruleKey, String status, long subjectId) {
        jdbc.update(
            "insert into mkt_escalation (org_id, kind, severity, subject_type, subject_id, title, rule_key, raised_at, status, created_at, updated_at) "
                + "values (?, 'STALLED_OPPORTUNITY', 'MEDIUM', 'MKT_OPPORTUNITY', ?, 'Stalled', ?, now(6), ?, now(6), now(6))",
            orgId, subjectId, ruleKey, status
        );
    }

    @Test
    void everyTableHasAnOrgIdAndOnlyCompositeTenantForeignKeys() {
        for (String t : TABLES) {
            assertThat(q("select count(*) from information_schema.columns where table_schema = database() and table_name = ? and column_name = 'org_id' and is_nullable = 'NO'", t)).as(t + ".org_id NOT NULL").isEqualTo(1L);
            assertThat(q("select count(*) from information_schema.key_column_usage where table_schema = database() and table_name = ? and column_name = 'org_id' and referenced_table_name = 'organization'", t)).as(t + " FK to organization").isGreaterThanOrEqualTo(1L);
            List<Map<String, Object>> fks = jdbc.queryForList(
                "select constraint_name c, column_name col, ordinal_position pos from information_schema.key_column_usage where table_schema = database() and table_name = ? and referenced_table_name is not null and referenced_table_name <> 'organization'", t);
            for (Map<String, Object> row : fks) if (((Number) row.get("pos")).intValue() == 1) assertThat(row.get("col")).as(t + "." + row.get("c") + " starts with org_id").isEqualTo("org_id");
            List<Map<String, Object>> idx = jdbc.queryForList("select index_name i, column_name col from information_schema.statistics where table_schema = database() and table_name = ? and seq_in_index = 1 and index_name <> 'PRIMARY'", t);
            for (Map<String, Object> row : idx) {
                String name = String.valueOf(row.get("i"));
                if (name.startsWith("fk_")) continue; // an FK's helper index MySQL created
                if (name.startsWith("uk_") && (row.get("col").equals("active_key") || row.get("col").equals("open_key"))) continue; // the generated keys already carry the org id
                assertThat(row.get("col")).as(t + " index " + name + " starts with org_id").isEqualTo("org_id");
            }
        }
        // the opportunity column that holds an assignment while a manager decides
        assertThat(q("select count(*) from information_schema.columns where table_schema = database() and table_name = 'mkt_opportunity' and column_name = 'approval_request_id'")).isEqualTo(1L);
    }

    @Test
    void onlyOneOpenRequestPerSubjectAndKindAndOneLiveEscalationPerRuleAndSubject() {
        ConsultantProfile k = consultant(a, "Kay One");
        flushIfInTransaction();
        approval(a.getId(), k.getId(), mktSpec.getId(), "PENDING", 500L, "OPPORTUNITY_ASSIGN");
        assertThatThrownBy(() -> approval(a.getId(), k.getId(), mktSpec.getId(), "PENDING", 500L, "OPPORTUNITY_ASSIGN")).isInstanceOf(DataIntegrityViolationException.class);
        approval(a.getId(), k.getId(), mktSpec.getId(), "PENDING", 500L, "DUPLICATE_OVERRIDE"); // another kind of the same subject is its own request
        approval(a.getId(), k.getId(), mktSpec.getId(), "PENDING", 501L, "OPPORTUNITY_ASSIGN"); // another subject too
        approval(a.getId(), k.getId(), mktSpec.getId(), "REJECTED", 500L, "OPPORTUNITY_ASSIGN"); // a decided one frees the key, and many may pile up
        approval(a.getId(), k.getId(), mktSpec.getId(), "REJECTED", 500L, "OPPORTUNITY_ASSIGN");
        assertThat(q("select count(*) from mkt_approval_request where org_id = ?", a.getId())).isEqualTo(5L);

        escalation(a.getId(), "STALLED_OPPORTUNITY", "OPEN", 700L);
        assertThatThrownBy(() -> escalation(a.getId(), "STALLED_OPPORTUNITY", "ACKNOWLEDGED", 700L)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> escalation(a.getId(), "STALLED_OPPORTUNITY", "SNOOZED", 700L)).isInstanceOf(DataIntegrityViolationException.class);
        escalation(a.getId(), "OVERDUE_FOLLOWUP", "OPEN", 700L); // another rule
        escalation(a.getId(), "STALLED_OPPORTUNITY", "RESOLVED", 700L); // a closed one frees the key
        escalation(a.getId(), "STALLED_OPPORTUNITY", "DISMISSED", 700L);
        escalation(a.getId(), null, "OPEN", 700L); // manual raises have no rule and are never deduplicated
        escalation(a.getId(), null, "OPEN", 700L);
        // the same subject id in another tenant is a different key
        escalation(b.getId(), "STALLED_OPPORTUNITY", "OPEN", 700L);
    }

    @Test
    void aRowPointingAtAnotherTenantsParentIsRefusedByTheDatabase() {
        ConsultantProfile acmeConsultant = consultant(a, "Kay Two");
        flushIfInTransaction();
        // org B cannot request an approval for org A's consultant, nor name org A's member as the requester
        assertThatThrownBy(() -> approval(b.getId(), acmeConsultant.getId(), bOwner.getId(), "PENDING", 1L, "OPPORTUNITY_ASSIGN")).isInstanceOf(DataIntegrityViolationException.class);
        ConsultantProfile betaConsultant = consultant(b, "Bea Two");
        flushIfInTransaction();
        assertThatThrownBy(() -> approval(b.getId(), betaConsultant.getId(), owner.getId(), "PENDING", 1L, "OPPORTUNITY_ASSIGN")).isInstanceOf(DataIntegrityViolationException.class);
        // an event cannot hang under another tenant's escalation
        escalation(a.getId(), "STALLED_OPPORTUNITY", "OPEN", 9L);
        Long acmeEscalation = jdbc.queryForObject("select max(id) from mkt_escalation where org_id = ?", Long.class, a.getId());
        assertThatThrownBy(() -> jdbc.update("insert into mkt_escalation_event (org_id, escalation_id, kind, occurred_at) values (?, ?, 'RAISED', now(6))", b.getId(), acmeEscalation))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void anEscalationsTrailGoesWithIt() {
        escalation(a.getId(), "OVERDUE_FOLLOWUP", "RESOLVED", 11L);
        Long id = jdbc.queryForObject("select max(id) from mkt_escalation where org_id = ?", Long.class, a.getId());
        jdbc.update("insert into mkt_escalation_event (org_id, escalation_id, kind, occurred_at) values (?, ?, 'RAISED', now(6))", a.getId(), id);
        jdbc.update("insert into mkt_escalation_event (org_id, escalation_id, kind, note, occurred_at) values (?, ?, 'RESOLVED', 'Cleared', now(6))", a.getId(), id);
        assertThat(q("select count(*) from mkt_escalation_event where org_id = ? and escalation_id = ?", a.getId(), id)).isEqualTo(2L);
        jdbc.update("delete from mkt_escalation where org_id = ? and id = ?", a.getId(), id);
        assertThat(q("select count(*) from mkt_escalation_event where org_id = ? and escalation_id = ?", a.getId(), id)).isZero();
    }

    /** NeverCollectedSchema-style guard (CLAUDE.md): no column could hold a date of birth, identity document, tax or bank number. */
    @Test
    void noColumnCouldHoldSensitivePii() {
        Set<String> bannedTokens = Set.of("ssn", "itin", "dob", "birth", "birthday", "passport", "visa", "i9", "ead", "bank", "routing", "iban", "swift", "ein", "tin", "vat", "phone", "mobile", "cell", "fax", "ssn4", "pin", "cvv", "card", "pan");
        List<String> bannedFragments = List.of("account_no", "account_number", "tax_id", "taxid", "document_number", "doc_number", "id_number", "licence_no", "license_no", "drivers_license", "national_id", "social_security", "date_of_birth");
        List<Map<String, Object>> cols = jdbc.queryForList(
            "select table_name t, column_name c from information_schema.columns where table_schema = database() and table_name in ('mkt_approval_request','mkt_escalation','mkt_escalation_event')"
        );
        assertThat(cols).hasSizeGreaterThan(35);
        for (Map<String, Object> row : cols) {
            String col = String.valueOf(row.get("c")).toLowerCase();
            for (String token : col.split("_")) assertThat(bannedTokens).as(row.get("t") + "." + col + " has a banned token").doesNotContain(token);
            for (String frag : bannedFragments) assertThat(col).as(row.get("t") + "." + col).doesNotContain(frag);
        }
    }
}
