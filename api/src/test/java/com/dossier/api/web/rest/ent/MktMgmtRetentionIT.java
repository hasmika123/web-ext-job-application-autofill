package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.service.ent.history.EnterpriseHistoryRetentionJob;
import com.dossier.api.service.ent.history.EnterpriseHistoryRetentionJob.MgmtResult;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * The retention of the Marketing Manager records (MM-01): approval requests that are no longer PENDING and escalations that are RESOLVED or DISMISSED are
 * deleted once they are older than {@code enterprise.history.mkt_mgmt_months} (default 36; the organization's own setting wins); an open record is never
 * touched, a recent one is kept, an escalation's trail goes with it, one SYSTEM audit row (counts only) is written, and a second run changes nothing.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class MktMgmtRetentionIT extends MemberItSupport {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private OrgSettingRepository orgSettings;
    @Autowired private EnterpriseHistoryRetentionJob job;

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

    private long approval(Long orgId, Long consultantId, Long requester, String status, long subjectId, int monthsOld) {
        Instant at = Instant.now().atZone(ZoneOffset.UTC).minusMonths(monthsOld).toInstant();
        jdbc.update(
            "insert into mkt_approval_request (org_id, kind, subject_type, subject_id, consultant_id, requested_by_member_id, requested_at, title, status, expires_at, created_at, updated_at) "
                + "values (?, 'OPPORTUNITY_ASSIGN', 'MKT_OPPORTUNITY', ?, ?, ?, ?, 'Anika to Acme', ?, ?, ?, ?)",
            orgId, subjectId, consultantId, requester, java.sql.Timestamp.from(at), status, java.sql.Timestamp.from(at), java.sql.Timestamp.from(at), java.sql.Timestamp.from(at)
        );
        return jdbc.queryForObject("select max(id) from mkt_approval_request where org_id = ?", Long.class, orgId);
    }

    private long escalation(Long orgId, String ruleKey, String status, long subjectId, int monthsOld) {
        Instant at = Instant.now().atZone(ZoneOffset.UTC).minusMonths(monthsOld).toInstant();
        jdbc.update(
            "insert into mkt_escalation (org_id, kind, severity, subject_type, subject_id, title, rule_key, raised_at, status, created_at, updated_at) "
                + "values (?, 'STALLED_OPPORTUNITY', 'MEDIUM', 'MKT_OPPORTUNITY', ?, 'Stalled', ?, ?, ?, ?, ?)",
            orgId, subjectId, ruleKey, java.sql.Timestamp.from(at), status, java.sql.Timestamp.from(at), java.sql.Timestamp.from(at)
        );
        long id = jdbc.queryForObject("select max(id) from mkt_escalation where org_id = ?", Long.class, orgId);
        jdbc.update("insert into mkt_escalation_event (org_id, escalation_id, kind, occurred_at) values (?, ?, 'RAISED', ?)", orgId, id, java.sql.Timestamp.from(at));
        return id;
    }

    private long count(String table, Long orgId) {
        return jdbc.queryForObject("select count(*) from " + table + " where org_id = ?", Long.class, orgId);
    }

    @Test
    void closedRecordsPastTheWindowGoAndOpenOrRecentOnesStay() {
        ConsultantProfile k = consultant(a, "Kay One");
        flushIfInTransaction();
        long oldRejected = approval(a.getId(), k.getId(), mktSpec.getId(), "REJECTED", 1L, 40);
        long oldApproved = approval(a.getId(), k.getId(), mktSpec.getId(), "APPROVED", 2L, 50);
        long oldPending = approval(a.getId(), k.getId(), mktSpec.getId(), "PENDING", 3L, 45);
        long recentRejected = approval(a.getId(), k.getId(), mktSpec.getId(), "REJECTED", 4L, 2);
        long oldResolved = escalation(a.getId(), "STALLED_OPPORTUNITY", "RESOLVED", 10L, 40);
        long oldDismissed = escalation(a.getId(), "OVERDUE_FOLLOWUP", "DISMISSED", 11L, 39);
        long oldOpen = escalation(a.getId(), "UNANSWERED_QUESTION", "OPEN", 12L, 48);
        long recentResolved = escalation(a.getId(), "STALLED_OPPORTUNITY", "RESOLVED", 13L, 3);
        long auditBefore = auditCount(a, "HISTORY_PURGED");

        List<MgmtResult> done = job.runMktMgmt(Instant.now());

        assertThat(done).extracting(MgmtResult::orgId).contains(a.getId());
        MgmtResult mine = done.stream().filter(r -> r.orgId().equals(a.getId())).findFirst().orElseThrow();
        assertThat(mine.approvals()).isEqualTo(2);
        assertThat(mine.escalations()).isEqualTo(2);
        assertThat(mine.months()).isEqualTo(36);
        assertThat(jdbc.queryForList("select id from mkt_approval_request where org_id = ? order by id", Long.class, a.getId())).containsExactly(oldPending, recentRejected);
        assertThat(jdbc.queryForList("select id from mkt_escalation where org_id = ? order by id", Long.class, a.getId())).containsExactly(oldOpen, recentResolved);
        assertThat(count("mkt_escalation_event", a.getId())).as("the trail of a deleted escalation goes with it").isEqualTo(2L);
        assertThat(oldRejected).isNotEqualTo(oldApproved);
        assertThat(oldResolved).isNotEqualTo(oldDismissed);
        assertThat(auditCount(a, "HISTORY_PURGED")).isEqualTo(auditBefore + 1);
        assertThat(newestAudit(a).getDetails()).isEqualTo("months=36 mktApprovals=2 mktEscalations=2");

        assertThat(job.runMktMgmt(Instant.now()).stream().filter(r -> r.orgId().equals(a.getId()))).as("a second run is a no-op").isEmpty();
        assertThat(count("mkt_approval_request", a.getId())).isEqualTo(2L);
    }

    @Test
    void theOrganizationsOwnWindowWinsAndZeroKeepsEverything() {
        ConsultantProfile k = consultant(a, "Kay Two");
        flushIfInTransaction();
        approval(a.getId(), k.getId(), mktSpec.getId(), "REJECTED", 1L, 8);
        orgSettings.saveAndFlush(setting(a.getId(), EnterpriseSettingKeys.HISTORY_MKT_MGMT_MONTHS, "6"));
        assertThat(job.runMktMgmt(Instant.now()).stream().filter(r -> r.orgId().equals(a.getId())).findFirst().orElseThrow().approvals()).isEqualTo(1);

        approval(a.getId(), k.getId(), mktSpec.getId(), "REJECTED", 2L, 8);
        orgSettings.saveAndFlush(setting(a.getId(), EnterpriseSettingKeys.HISTORY_MKT_MGMT_MONTHS, "0"));
        assertThat(job.runMktMgmt(Instant.now()).stream().filter(r -> r.orgId().equals(a.getId()))).isEmpty();
        assertThat(count("mkt_approval_request", a.getId())).isEqualTo(1L);
    }

    @Test
    void anotherOrganizationsRowsAreNeverTouchedByThisOnesWindow() {
        ConsultantProfile ka = consultant(a, "Kay Three");
        ConsultantProfile kb = consultant(b, "Bea Three");
        flushIfInTransaction();
        approval(a.getId(), ka.getId(), mktSpec.getId(), "REJECTED", 1L, 8);
        approval(b.getId(), kb.getId(), bMember.getId(), "REJECTED", 1L, 8);
        orgSettings.saveAndFlush(setting(a.getId(), EnterpriseSettingKeys.HISTORY_MKT_MGMT_MONTHS, "6"));
        job.runMktMgmt(Instant.now());
        assertThat(count("mkt_approval_request", a.getId())).isZero();
        assertThat(count("mkt_approval_request", b.getId())).as("B keeps the registry window of 36 months").isEqualTo(1L);
    }

    private static OrgSetting setting(Long orgId, String key, String value) {
        OrgSetting s = new OrgSetting();
        s.setOrgId(orgId);
        s.setSettingKey(key);
        s.setValueJson(value);
        s.setUpdatedAt(Instant.now());
        return s;
    }
}
