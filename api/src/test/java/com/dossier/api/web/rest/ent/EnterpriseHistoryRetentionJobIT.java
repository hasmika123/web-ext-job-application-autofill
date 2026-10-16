package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.ent.mkt.MktSubmission;
import com.dossier.api.domain.ent.mkt.MktSubmissionEvent;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.ent.talent.TalentInterviewEvent;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.service.ent.history.EnterpriseHistoryRetentionJob;
import com.dossier.api.service.ent.history.EnterpriseHistoryRetentionJob.OrgResult;
import com.dossier.api.service.org.OrgAuditAsserts;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * X9.15: the nightly retention job on the real stack. At 0 months (the default, "for the life of the record") nothing is deleted; at N months rows older than
 * N months go from the three history tables, EXCEPT the newest row of every record; an organization's own {@code org_setting} outranks the registry; one
 * SYSTEM {@code HISTORY_PURGED} audit row per organization per run carries counts only; a second run is a no-op; and another organization's rows are never
 * touched. Runs inside the test transaction (it rolls back), so the job's own transactions join it.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@org.junit.jupiter.api.Timeout(180)
class EnterpriseHistoryRetentionJobIT extends MemberItSupport {

    @Autowired private EnterpriseHistoryRetentionJob job;
    @Autowired private JdbcTemplate jdbc;

    private final Instant now = Instant.parse("2026-10-15T03:00:00Z");

    private TalentApplication appA;
    private TalentApplication appA2;
    private TalentApplication appB;
    private long keptNewest; // appA's newest event, 10 days old
    private long keptLastOfOld; // appA2's only events are old: its newest survives
    private long goneOld1;
    private long goneOld2;
    private long goneOld3;
    private long bOld;
    private TalentInterview interview;
    private MktSubmission submission;

    private long appEvent(Long orgId, TalentApplication app, long daysAgo) {
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setOrgId(orgId);
        e.setApplicationId(app.getId());
        e.setEventType("STAGE_CHANGE");
        e.setToStage("ASSIGNED");
        e.setActorMemberId(orgId.equals(a.getId()) ? mktSpec.getId() : bOwner.getId());
        e.setOccurredAt(now.minus(daysAgo, ChronoUnit.DAYS));
        em.persist(e);
        em.flush();
        return e.getId();
    }

    @BeforeEach
    void history() {
        ClientAccount clientA = ApplicationItSupport.client(em, a.getId(), "Initech");
        ClientRequirement jobA = ApplicationItSupport.job(em, a.getId(), clientA, "Data Engineer");
        ConsultantProfile kara = ApplicationItSupport.consultant(em, a.getId(), "Kara One");
        appA = ApplicationItSupport.application(em, a.getId(), jobA, kara, mktSpec.getId(), "ASSIGNED", 3);
        appA2 = ApplicationItSupport.application(em, a.getId(), jobA, ApplicationItSupport.consultant(em, a.getId(), "Kim Two"), mktSpec.getId(), "ASSIGNED", 3);
        jdbc.update("delete from talent_application_event where application_id in (?, ?)", appA.getId(), appA2.getId()); // the fixture's own CREATED rows

        goneOld1 = appEvent(a.getId(), appA, 800);
        goneOld2 = appEvent(a.getId(), appA, 400);
        goneOld3 = appEvent(a.getId(), appA, 200);
        appEvent(a.getId(), appA, 30); // inside the window
        keptNewest = appEvent(a.getId(), appA, 10);
        appEvent(a.getId(), appA2, 500);
        keptLastOfOld = appEvent(a.getId(), appA2, 300);

        ClientAccount clientB = ApplicationItSupport.client(em, b.getId(), "Globex");
        ClientRequirement jobB = ApplicationItSupport.job(em, b.getId(), clientB, "QA Lead");
        appB = ApplicationItSupport.application(em, b.getId(), jobB, ApplicationItSupport.consultant(em, b.getId(), "Bo Cee"), bOwner.getId(), "ASSIGNED", 3);
        jdbc.update("delete from talent_application_event where application_id = ?", appB.getId());
        appEvent(b.getId(), appB, 900);
        bOld = appEvent(b.getId(), appB, 700);

        interview = new TalentInterview();
        interview.setOrgId(a.getId());
        interview.setConsultantId(kara.getId());
        interview.setClientId(clientA.getId());
        interview.setStatus("SCHEDULED");
        em.persist(interview);
        em.flush();
        jdbc.update("delete from talent_interview_event where interview_id = ?", interview.getId());
        interviewEvent(900);
        interviewEvent(20);

        submission = new MktSubmission();
        submission.setOrgId(a.getId());
        submission.setCode("SUB-IT-" + p);
        submission.setConsultantId(kara.getId());
        submission.setRequirementId(jobA.getId());
        submission.setClientId(clientA.getId());
        em.persist(submission);
        em.flush();
        jdbc.update("delete from mkt_submission_event where submission_id = ?", submission.getId());
        em.persist(MktSubmissionEvent.of(a.getId(), submission.getId(), "CREATED", null, null, null, mktSpec.getId(), null, now.minus(700, ChronoUnit.DAYS)));
        em.persist(MktSubmissionEvent.of(a.getId(), submission.getId(), "STATUS", "status", "DRAFT", "SUBMITTED", mktSpec.getId(), null, now.minus(5, ChronoUnit.DAYS)));
        em.flush();
    }

    private void interviewEvent(long daysAgo) {
        TalentInterviewEvent e = new TalentInterviewEvent();
        e.setOrgId(a.getId());
        e.setInterviewId(interview.getId());
        e.setEventType("STATUS");
        e.setActorMemberId(mktSpec.getId());
        e.setOccurredAt(now.minus(daysAgo, ChronoUnit.DAYS));
        em.persist(e);
        em.flush();
    }

    private void override(Long orgId, String months) {
        OrgSetting s = new OrgSetting();
        s.setOrgId(orgId);
        s.setSettingKey(EnterpriseSettingKeys.HISTORY_RETENTION_MONTHS);
        s.setValueJson(months);
        s.setUpdatedBy(WHO);
        s.setUpdatedAt(Instant.now());
        em.persist(s);
        em.flush();
    }

    private long count(String table, Long orgId) {
        return jdbc.queryForObject("select count(*) from " + table + " where org_id = ?", Long.class, orgId);
    }

    private boolean exists(long eventId) {
        return jdbc.queryForObject("select count(*) from talent_application_event where id = ?", Long.class, eventId) == 1;
    }

    private long purgedAuditRows(Long orgId) {
        return OrgAuditAsserts.rows(audit, orgId).stream().filter(e -> "HISTORY_PURGED".equals(e.getAction())).count();
    }

    @Test
    void theDefaultIsZeroAndZeroDeletesNothing() {
        assertThat(settingsCache.getInt(EnterpriseSettingKeys.HISTORY_RETENTION_MONTHS)).isZero();
        long before = count("talent_application_event", a.getId());

        job.runOnce(now);

        assertThat(count("talent_application_event", a.getId())).isEqualTo(before);
        assertThat(exists(goneOld1)).isTrue();
        assertThat(purgedAuditRows(a.getId())).isZero();
    }

    @Test
    void sixMonthsDeletesOlderRowsButKeepsTheNewestOfEveryRecordAndAuditsOnce() {
        override(a.getId(), "6");
        long auditBefore = auditCount(a);

        List<OrgResult> done = job.runOnce(now);

        assertThat(done).hasSize(1);
        assertThat(done.get(0).orgId()).isEqualTo(a.getId());
        assertThat(done.get(0).applications()).as("800, 400 and 200 days of appA, 500 days of appA2").isEqualTo(4);
        assertThat(done.get(0).interviews()).isEqualTo(1);
        assertThat(done.get(0).submissions()).isEqualTo(1);
        assertThat(exists(goneOld1)).isFalse();
        assertThat(exists(goneOld2)).isFalse();
        assertThat(exists(goneOld3)).isFalse();
        assertThat(exists(keptNewest)).isTrue();
        assertThat(exists(keptLastOfOld)).as("a record keeps its newest row even when it is older than the window").isTrue();
        assertThat(count("talent_application_event", a.getId())).isEqualTo(3); // appA: 30d + 10d, appA2: 300d
        assertThat(count("talent_interview_event", a.getId())).isEqualTo(1);
        assertThat(count("mkt_submission_event", a.getId())).isEqualTo(1);

        assertThat(auditCount(a)).isEqualTo(auditBefore + 1);
        OrgAuditEvent row = newestAudit(a);
        assertThat(row.getAction()).isEqualTo("HISTORY_PURGED");
        assertThat(row.getActorLogin()).isEqualTo("system");
        assertThat(row.getDetails()).isEqualTo("months=6 applications=4 interviews=1 submissions=1");

        assertThat(count("talent_application_event", b.getId())).as("another organization is never touched").isEqualTo(2);
        assertThat(exists(bOld)).isTrue();
        assertThat(purgedAuditRows(b.getId())).isZero();
    }

    @Test
    void runningItAgainIsANoOp() {
        override(a.getId(), "6");
        job.runOnce(now);
        long events = count("talent_application_event", a.getId());
        long audits = auditCount(a);

        List<OrgResult> second = job.runOnce(now);

        assertThat(second).isEmpty();
        assertThat(count("talent_application_event", a.getId())).isEqualTo(events);
        assertThat(auditCount(a)).as("no purge, no audit row").isEqualTo(audits);
    }

    @Test
    void anOrganizationsOwnSettingOutranksTheRegistryAndOneBadValueIsIgnored() {
        override(a.getId(), "24"); // keeps 800-day rows? no: 800 days is ~26 months, so only that one goes
        override(b.getId(), "\"nonsense\""); // not a number: the registry value (0) applies

        List<OrgResult> done = job.runOnce(now);

        assertThat(done).extracting(OrgResult::orgId).containsExactly(a.getId());
        assertThat(exists(goneOld1)).isFalse();
        assertThat(exists(goneOld2)).as("400 days is inside 24 months").isTrue();
        assertThat(count("talent_application_event", b.getId())).isEqualTo(2);
    }

    @Test
    void theRegistryValueIsBoundedAndDocumented() {
        var key = EnterpriseSettingKeys.find(EnterpriseSettingKeys.HISTORY_RETENTION_MONTHS);
        assertThat(key).isNotNull();
        assertThat(key.defaultValue()).isEqualTo("0");
        assertThat(key.min()).isEqualTo(0.0);
        assertThat(key.max()).isEqualTo(120.0);
        assertThat(key.description()).contains("0 keeps it as long as the record exists");
        assertThat(EnterpriseSettingKeys.all()).contains(key);
    }

    @Test
    void theGlobalRegistryValueAppliesToOrganizationsWithoutAnOverride() {
        settingRows.save(new AppSetting(EnterpriseSettingKeys.HISTORY_RETENTION_MONTHS, "6", WHO, Instant.now()));
        settingsCache.invalidate();
        override(b.getId(), "0"); // b keeps everything

        List<OrgResult> done = job.runOnce(now);

        assertThat(done).extracting(OrgResult::orgId).contains(a.getId()).doesNotContain(b.getId());
        assertThat(exists(goneOld1)).isFalse();
        assertThat(count("talent_application_event", b.getId())).isEqualTo(2);
    }
}
