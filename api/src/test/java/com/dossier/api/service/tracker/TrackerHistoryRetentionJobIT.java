package com.dossier.api.service.tracker;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ApplicationEventService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import com.dossier.api.service.settings.SettingDefinitions;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * U6.15: the nightly retention job on the real stack. At 0 months (the default, "for the life of the record") nothing is deleted; at 12 it deletes the
 * history older than 12 months but keeps the newest row of every application; the application's own updated_by is never touched; re-running is a no-op.
 * Runs inside the test transaction, which rolls back.
 */
@IntegrationTest
@WithMockUser(username = "user")
@Transactional
class TrackerHistoryRetentionJobIT {

    private static final String WHO = "tracker-retention-it";

    @Autowired private TrackerHistoryRetentionJob job;
    @Autowired private ApplicationEventService eventService;
    @Autowired private ApplicationEventRepository events;
    @Autowired private ApplicationRepository applications;
    @Autowired private UserRepository users;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings settings;

    private final Instant now = Instant.parse("2026-10-15T03:00:00Z");
    private Application busy;
    private Application quiet;
    private User owner;

    private void at(Application a, long daysAgo) {
        eventService.recordAt(a, ApplicationEvent.STATUS, ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW, ApplicationEvent.SRC_WEB, null, "Moved", now.minus(daysAgo, ChronoUnit.DAYS), ChangeActor.forOwner(owner), null);
    }

    private Application app(String company) {
        Application a = new Application();
        a.setUser(owner);
        a.setCompany(company);
        a.setRoleTitle("Engineer");
        a.setStatus(ApplicationStatus.APPLIED);
        a.setCreatedAt(now.minus(1000, ChronoUnit.DAYS));
        a.setUpdatedAt(now.minus(1000, ChronoUnit.DAYS));
        a.setArchived(false);
        a.setUpdatedByUserId(owner.getId());
        a.setUpdatedByLogin(owner.getLogin());
        return applications.saveAndFlush(a);
    }

    @BeforeEach
    void history() {
        owner = users.findOneByLogin("user").orElseThrow();
        busy = app("Busy Co");
        quiet = app("Quiet Co");
        at(busy, 800);
        at(busy, 400);
        at(busy, 200);
        at(busy, 20);
        at(quiet, 900);
        at(quiet, 700);
        events.flush();
    }

    @AfterEach
    void clean() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        settings.invalidate();
    }

    private void retention(int months) {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        settingRows.save(new AppSetting(AdminSettingKeys.TRACKER_HISTORY_RETENTION_MONTHS, String.valueOf(months), WHO, Instant.now()));
        settings.invalidate();
    }

    private long count(Application a) {
        events.flush();
        return events.countByApplicationId(a.getId());
    }

    @Test
    void theSettingIsInTheRegistryWithItsBoundsAndDescription() {
        var key = SettingDefinitions.find("tracker.history.retention_months");
        assertThat(key).isNotNull();
        assertThat(key.defaultValue()).isEqualTo("0");
        assertThat(key.min()).isEqualTo(0.0);
        assertThat(key.max()).isEqualTo(120.0);
        assertThat(key.description()).isEqualTo("Months of application history kept; 0 keeps it as long as the application exists.");
        assertThat(settings.getInt("tracker.history.retention_months")).isZero();
    }

    @Test
    void zeroMonthsDeletesNothing() {
        assertThat(job.runOnce(now)).isZero();
        assertThat(count(busy)).isEqualTo(4);
        assertThat(count(quiet)).isEqualTo(2);
    }

    @Test
    void twelveMonthsDeletesOlderRowsButKeepsTheNewestOfEveryApplicationAndIsIdempotent() {
        retention(12);

        int first = job.runOnce(now);

        // busy: 800, 400 and 200... 200 days is inside 12 months, so only 800 and 400 go; quiet: 900 goes, 700 is its newest and stays
        assertThat(first).as("at least these three (other rows of the shared test database may add to it)").isGreaterThanOrEqualTo(3);
        assertThat(count(busy)).isEqualTo(2);
        assertThat(count(quiet)).isEqualTo(1);
        List<ApplicationEvent> left = events.findByApplicationIdOrderByCreatedAtDescIdDesc(quiet.getId(), PageRequest.of(0, 5));
        assertThat(left.get(0).getCreatedAt()).as("the newest row of a record is never purged").isEqualTo(now.minus(700, ChronoUnit.DAYS));

        Application head = applications.findById(busy.getId()).orElseThrow();
        assertThat(head.getUpdatedByUserId()).as("the head record's updated_by is never touched").isEqualTo(owner.getId());

        assertThat(job.runOnce(now)).as("a second run changes nothing").isZero();
        assertThat(count(busy)).isEqualTo(2);
        assertThat(count(quiet)).isEqualTo(1);
    }

    @Test
    void sixMonthsAlsoDropsTheTwoHundredDayRow() {
        retention(6);
        assertThat(job.runOnce(now)).isGreaterThanOrEqualTo(4); // busy 800, 400, 200 and quiet 900
        assertThat(count(busy)).isEqualTo(1);
        assertThat(count(quiet)).isEqualTo(1);
    }
}
