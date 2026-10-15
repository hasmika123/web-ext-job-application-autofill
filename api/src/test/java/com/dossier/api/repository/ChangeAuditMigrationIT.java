package com.dossier.api.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.ApplicationNote;
import com.dossier.api.domain.Interview;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * U6.12 (docs/change-audit/README.md section 2.2): the tracker half of the change audit. The columns exist with
 * the right defaults, and the backfill (D1) attributes the past: WEB / EXTENSION history rows to the application's
 * owner, INBOX to MAIL, ASSISTANT to ASSISTANT, SYSTEM stays SYSTEM; head records to the owner; and running the
 * backfill again changes nothing.
 */
@IntegrationTest
@WithMockUser(username = "user")
@Transactional
class ChangeAuditMigrationIT {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ApplicationRepository applications;

    @Autowired
    private ApplicationEventRepository events;

    @Autowired
    private ApplicationNoteRepository notes;

    @Autowired
    private InterviewRepository interviews;

    @Autowired
    private UserRepository users;

    private List<String> backfillStatements() throws Exception {
        String xml = new String(new ClassPathResource("config/liquibase/changelog/20261110010000_change_audit_tracker.xml").getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        xml = xml.replaceAll("(?s)<rollback>.*?</rollback>", "");
        Matcher m = Pattern.compile("(?s)<sql>(.*?)</sql>").matcher(xml);
        List<String> out = new ArrayList<>();
        while (m.find()) out.add(m.group(1).trim());
        return out;
    }

    private boolean hasColumn(String table, String column) {
        Long n = jdbc.queryForObject(
            "select count(*) from information_schema.columns where table_schema = database() and table_name = ? and column_name = ?",
            Long.class,
            table,
            column
        );
        return n != null && n == 1;
    }

    @Test
    void theColumnsExistOnEveryTrackerTable() {
        for (String c : List.of("actor_kind", "actor_user_id", "actor_login", "on_behalf_of_user_id", "changes")) {
            assertThat(hasColumn("application_event", c)).as("application_event." + c).isTrue();
        }
        for (String table : List.of("application", "application_note", "interview")) {
            for (String c : List.of("created_by_user_id", "created_by_login", "updated_by_user_id", "updated_by_login")) {
                assertThat(hasColumn(table, c)).as(table + "." + c).isTrue();
            }
        }
    }

    @Test
    void anEventWrittenWithoutAnActorIsSystem() {
        User owner = users.findOneByLogin("user").orElseThrow();
        Application app = application(owner, Instant.parse("2026-09-01T10:00:00Z"));
        jdbc.update(
            "insert into application_event (application_id, kind, source, created_at) values (?, 'CREATED', 'WEB', now())",
            app.getId()
        );
        Map<String, Object> row = jdbc.queryForMap("select actor_kind, actor_user_id, actor_login, on_behalf_of_user_id, changes from application_event where application_id = ?", app.getId());
        assertThat(row.get("actor_kind")).isEqualTo("SYSTEM");
        assertThat(row.get("actor_user_id")).isNull();
        assertThat(row.get("actor_login")).isNull();
        assertThat(row.get("on_behalf_of_user_id")).isNull();
        assertThat(row.get("changes")).isNull();
    }

    @Test
    void theBackfillAttributesThePastPerSourceAndRunningItAgainChangesNothing() throws Exception {
        User owner = users.findOneByLogin("user").orElseThrow();
        Instant t0 = Instant.parse("2026-09-01T10:00:00Z");
        Application app = application(owner, t0);
        long web = event(app, "WEB", t0);
        long ext = event(app, "EXTENSION", t0.plusSeconds(60));
        long inbox = event(app, "INBOX", t0.plusSeconds(120));
        long assistant = event(app, "ASSISTANT", t0.plusSeconds(180));
        long system = event(app, "SYSTEM", t0.plusSeconds(240));

        ApplicationNote note = new ApplicationNote();
        note.setApplicationId(app.getId());
        note.setBody("a note");
        notes.saveAndFlush(note);
        Interview interview = new Interview();
        interview.setApplicationId(app.getId());
        interview.setUserId(owner.getId());
        interview.setKind("VIDEO");
        interview.setStartsAt(t0.plusSeconds(86400));
        interviews.saveAndFlush(interview);

        List<String> statements = backfillStatements();
        assertThat(statements).hasSize(6);
        for (String sql : statements) jdbc.execute(sql);

        assertThat(kindOf(web)).isEqualTo("PERSON");
        assertThat(kindOf(ext)).isEqualTo("PERSON");
        assertThat(kindOf(inbox)).isEqualTo("MAIL");
        assertThat(kindOf(assistant)).isEqualTo("ASSISTANT");
        assertThat(kindOf(system)).isEqualTo("SYSTEM");
        for (long id : List.of(web, ext)) {
            Map<String, Object> row = jdbc.queryForMap("select actor_user_id, actor_login from application_event where id = ?", id);
            assertThat(((Number) row.get("actor_user_id")).longValue()).isEqualTo(owner.getId());
            assertThat(row.get("actor_login")).isEqualTo("user");
        }
        for (long id : List.of(inbox, assistant, system)) {
            assertThat(jdbc.queryForObject("select actor_user_id from application_event where id = ?", Long.class, id)).as("no person behind it").isNull();
        }
        assertThat(jdbc.queryForObject("select count(*) from application_event where actor_login like 'ent#%'", Long.class)).isZero();

        // Head records: the owner created and last wrote the application, its note and its interview.
        for (String table : List.of("application", "application_note", "interview")) {
            long id = switch (table) {
                case "application" -> app.getId();
                case "application_note" -> note.getId();
                default -> interview.getId();
            };
            Map<String, Object> row = jdbc.queryForMap("select created_by_user_id, created_by_login, updated_by_user_id, updated_by_login from " + table + " where id = ?", id);
            assertThat(((Number) row.get("created_by_user_id")).longValue()).as(table).isEqualTo(owner.getId());
            assertThat(row.get("created_by_login")).as(table).isEqualTo("user");
            assertThat(((Number) row.get("updated_by_user_id")).longValue()).as(table).isEqualTo(owner.getId());
            assertThat(row.get("updated_by_login")).as(table).isEqualTo("user");
        }

        // Idempotent: a second run matches (and so changes) zero rows.
        for (String sql : statements) assertThat(jdbc.update(sql)).as(sql).isZero();
    }

    private Application application(User owner, Instant at) {
        Application a = new Application();
        a.setUser(owner);
        a.setCompany("Acme");
        a.setRoleTitle("Engineer");
        a.setStatus(ApplicationStatus.APPLIED);
        a.setCreatedAt(at);
        a.setUpdatedAt(at);
        return applications.saveAndFlush(a);
    }

    private long event(Application app, String source, Instant at) {
        ApplicationEvent e = new ApplicationEvent();
        e.setApplicationId(app.getId());
        e.setKind(ApplicationEvent.STATUS);
        e.setSource(source);
        e.setCreatedAt(at);
        return events.saveAndFlush(e).getId();
    }

    private String kindOf(long eventId) {
        return jdbc.queryForObject("select actor_kind from application_event where id = ?", String.class, eventId);
    }
}
