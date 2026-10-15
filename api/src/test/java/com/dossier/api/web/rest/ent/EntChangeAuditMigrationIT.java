package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.consultantws.CwsSubmission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.ent.talent.TalentApplicationNote;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * X9.13 (docs/change-audit/README.md section 2.2): the enterprise half of the change audit. The columns exist with the right defaults, and the
 * backfill attributes the past: no-actor events are SYSTEM, a record's updated_by / created_by are the actors of its newest / oldest event when
 * a person, notes and submissions get their preparer, and running the backfill again changes nothing.
 */
@IntegrationTest
@org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
@Transactional
@org.junit.jupiter.api.Timeout(120)
class EntChangeAuditMigrationIT extends MemberItSupport {

    @Autowired
    private JdbcTemplate jdbc;

    private ConsultantProfile kara;
    private ClientRequirement job;

    @BeforeEach
    void world() {
        ClientAccount client = ApplicationItSupport.client(em, a.getId(), "Initech");
        job = ApplicationItSupport.job(em, a.getId(), client, "Data Engineer");
        kara = ApplicationItSupport.consultant(em, a.getId(), "Kara One");
    }

    private List<String> backfillStatements() throws Exception {
        String xml = new String(new ClassPathResource("config/liquibase/changelog/20261110020000_change_audit_enterprise.xml").getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        xml = xml.replaceAll("(?s)<rollback>.*?</rollback>", "");
        Matcher m = Pattern.compile("(?s)<sql>(.*?)</sql>").matcher(xml);
        List<String> out = new ArrayList<>();
        while (m.find()) out.add(m.group(1).trim());
        return out;
    }

    private boolean hasColumn(String table, String column) {
        Long n = jdbc.queryForObject("select count(*) from information_schema.columns where table_schema = database() and table_name = ? and column_name = ?", Long.class, table, column);
        return n != null && n == 1;
    }

    private long event(TalentApplication app, String type, Long actor, int secondsAgo) {
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setOrgId(a.getId());
        e.setApplicationId(app.getId());
        e.setEventType(type);
        e.setToStage("ASSIGNED");
        e.setActorMemberId(actor);
        e.setOccurredAt(Instant.now().minusSeconds(secondsAgo));
        em.persist(e);
        em.flush();
        // the past as it was before this design: every row PERSON by default, whether or not it had an actor
        jdbc.update("update talent_application_event set actor_kind = 'PERSON' where id = ?", e.getId());
        return e.getId();
    }

    @Test
    void theColumnsExist() {
        for (String t : List.of("talent_application", "talent_interview", "mkt_submission", "cws_submission")) {
            assertThat(hasColumn(t, "created_by_member_id")).as(t + ".created_by_member_id").isTrue();
            assertThat(hasColumn(t, "updated_by_member_id")).as(t + ".updated_by_member_id").isTrue();
        }
        assertThat(hasColumn("talent_application_note", "updated_by_member_id")).isTrue();
        assertThat(hasColumn("talent_application_note", "updated_at")).isTrue();
        for (String t : List.of("talent_application_event", "talent_interview_event", "mkt_submission_event")) {
            assertThat(hasColumn(t, "actor_kind")).as(t + ".actor_kind").isTrue();
            assertThat(hasColumn(t, "changes")).as(t + ".changes").isTrue();
        }
    }

    @Test
    void anEventInsertedWithoutAnActorKindIsAPerson() {
        TalentApplication app = ApplicationItSupport.application(em, a.getId(), job, kara, mktSpec.getId(), "ASSIGNED", 3);
        jdbc.update("insert into talent_application_event (org_id, application_id, event_type, occurred_at) values (?, ?, 'NOTE', now())", a.getId(), app.getId());
        assertThat(jdbc.queryForObject("select actor_kind from talent_application_event where application_id = ? and event_type = 'NOTE'", String.class, app.getId())).isEqualTo("PERSON");
    }

    @Test
    void theBackfillAttributesThePastAndRunningItAgainChangesNothing() throws Exception {
        TalentApplication withActors = ApplicationItSupport.application(em, a.getId(), job, kara, mktSpec.getId(), "ASSIGNED", 9);
        TalentApplication systemLast = ApplicationItSupport.application(em, a.getId(), job, ApplicationItSupport.consultant(em, a.getId(), "Kim Two"), mktSpec.getId(), "ASSIGNED", 9);
        jdbc.update("delete from talent_application_event where application_id in (?, ?)", withActors.getId(), systemLast.getId());

        long first = event(withActors, "CREATED", mktSpec.getId(), 5000);
        long mid = event(withActors, "STAGE_CHANGE", owner.getId(), 3000);
        long newest = event(withActors, "STAGE_CHANGE", admin.getId(), 1000);
        long sysFirst = event(systemLast, "CREATED", mktSpec.getId(), 5000);
        long sysNewest = event(systemLast, "STAGE_CHANGE", null, 1000);

        TalentApplicationNote note = new TalentApplicationNote();
        note.setOrgId(a.getId());
        note.setApplicationId(withActors.getId());
        note.setAuthorMemberId(mktSpec.getId());
        note.setBody("n");
        note.setCreatedAt(Instant.parse("2026-09-01T10:00:00Z"));
        em.persist(note);

        ClientRequirement otherJob = ApplicationItSupport.job(em, a.getId(), em.find(ClientAccount.class, job.getClientId()), "QA Lead");
        CwsSubmission open = cws(mktSpec.getId(), null, job.getId());
        CwsSubmission decided = cws(mktSpec.getId(), Instant.parse("2026-09-05T10:00:00Z"), otherJob.getId());
        em.flush();
        // as they were before the design: no updated_by anywhere
        jdbc.update("update talent_application set created_by_member_id = null, updated_by_member_id = null");
        jdbc.update("update cws_submission set created_by_member_id = null, updated_by_member_id = null");
        jdbc.update("update talent_application_note set updated_by_member_id = null, updated_at = null");

        List<String> statements = backfillStatements();
        assertThat(statements).hasSize(12);
        for (String sql : statements) jdbc.execute(sql);

        assertThat(kind(sysNewest)).as("no actor is the system").isEqualTo("SYSTEM");
        assertThat(kind(first)).isEqualTo("PERSON");
        assertThat(kind(mid)).isEqualTo("PERSON");
        assertThat(kind(newest)).isEqualTo("PERSON");
        assertThat(kind(sysFirst)).isEqualTo("PERSON");

        assertThat(head("talent_application", withActors.getId(), "updated_by_member_id")).as("the newest event's actor").isEqualTo(admin.getId());
        assertThat(head("talent_application", withActors.getId(), "created_by_member_id")).as("the oldest event's actor").isEqualTo(mktSpec.getId());
        assertThat(head("talent_application", systemLast.getId(), "updated_by_member_id")).as("the newest event was the system: nobody").isNull();
        assertThat(head("talent_application", systemLast.getId(), "created_by_member_id")).isEqualTo(mktSpec.getId());

        assertThat(head("talent_application_note", note.getId(), "updated_by_member_id")).isEqualTo(mktSpec.getId());
        assertThat(jdbc.queryForObject("select updated_at is not null from talent_application_note where id = ?", Boolean.class, note.getId())).isTrue();
        assertThat(head("cws_submission", open.getId(), "created_by_member_id")).isEqualTo(mktSpec.getId());
        assertThat(head("cws_submission", open.getId(), "updated_by_member_id")).as("not yet decided: the preparer wrote last").isEqualTo(mktSpec.getId());
        assertThat(head("cws_submission", decided.getId(), "updated_by_member_id")).as("decided: the consultant's seat is unknown here, so nobody").isNull();

        // Idempotent: a second run matches (and so changes) zero rows.
        for (String sql : statements) assertThat(jdbc.update(sql)).as(sql).isZero();
    }

    private CwsSubmission cws(Long marketer, Instant decidedAt, Long requirementId) {
        CwsSubmission s = new CwsSubmission();
        s.setOrgId(a.getId());
        s.setConsultantId(kara.getId());
        s.setRequirementId(requirementId);
        s.setMarketerMemberId(marketer);
        s.setStatus(decidedAt == null ? CwsSubmission.PENDING : CwsSubmission.APPROVED);
        s.setDecidedAt(decidedAt);
        s.setSampleData(false);
        em.persist(s);
        return s;
    }

    private String kind(long eventId) {
        return jdbc.queryForObject("select actor_kind from talent_application_event where id = ?", String.class, eventId);
    }

    private Long head(String table, long id, String column) {
        Map<String, Object> row = jdbc.queryForMap("select " + column + " as v from " + table + " where id = ?", id);
        Object v = row.get("v");
        return v == null ? null : ((Number) v).longValue();
    }
}
