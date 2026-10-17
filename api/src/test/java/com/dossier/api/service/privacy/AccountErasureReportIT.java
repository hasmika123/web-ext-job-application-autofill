package com.dossier.api.service.privacy;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AiQuotaOverride;
import com.dossier.api.domain.BugReport;
import com.dossier.api.domain.SalesInquiry;
import com.dossier.api.domain.enumeration.BugCategory;
import com.dossier.api.domain.enumeration.BugStatus;
import com.dossier.api.domain.enumeration.InquiryStatus;
import com.dossier.api.domain.privacy.AccountDeletionReport;
import com.dossier.api.domain.privacy.DataExportJob;
import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.repository.BugReportRepository;
import com.dossier.api.repository.SalesInquiryRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.privacy.AccountDeletionReportRepository;
import com.dossier.api.repository.privacy.DataExportJobRepository;
import com.dossier.api.service.AccountDeletionService;
import com.dossier.api.service.AccountExportService;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.storage.FileStorage;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * Erasure completeness (T1.3): the rows the data map found nobody erased (bug reports, contact-us messages, an admin AI quota, a pending admin
 * challenge) go with the account, the export ZIPs go with the person's files, another person's rows stay, and every erasure leaves a purge report
 * whose counts match and which carries no identity.
 */
@IntegrationTest
@Transactional
class AccountErasureReportIT {

    @Autowired private AccountDeletionService deletion;
    @Autowired private AccountExportService exportService;
    @Autowired private ErasureCensus census;
    @Autowired private UserRepository users;
    @Autowired private BugReportRepository bugReports;
    @Autowired private SalesInquiryRepository inquiries;
    @Autowired private AiQuotaOverrideRepository quotas;
    @Autowired private DataExportJobRepository exportJobs;
    @Autowired private AccountDeletionReportRepository reports;
    @Autowired private TermsAcceptanceService terms;
    @Autowired private FileStorage storage;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper mapper;

    @MockitoBean private StripeGateway stripeGateway;

    private final java.util.List<String> filesToClean = new java.util.ArrayList<>();

    @AfterEach
    void cleanUp() {
        for (String k : filesToClean) storage.delete(k);
    }

    private BugReport bug(String login) {
        BugReport b = new BugReport();
        b.setSource("web");
        b.setUserLogin(login);
        b.setMessage("it broke for " + login);
        b.setCategory(BugCategory.BUG);
        b.setStatus(BugStatus.NEW);
        b.setCreatedDate(Instant.now());
        return bugReports.saveAndFlush(b);
    }

    private SalesInquiry inquiry(String login) {
        SalesInquiry i = new SalesInquiry();
        i.setTopic("general");
        i.setName("N");
        i.setEmail("n@example.test");
        i.setMessage("hello");
        i.setUserLogin(login);
        i.setStatus(InquiryStatus.NEW);
        i.setCreatedDate(Instant.now());
        return inquiries.saveAndFlush(i);
    }

    private long count(String sql, Object... args) {
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }

    @Test
    void everythingKeyedByThePersonGoesAndEverythingKeyedByTheOtherPersonStays() throws Exception {
        Long uid = users.findOneByLogin("user").orElseThrow().getId();
        Long otherId = users.findOneByLogin("admin").orElseThrow().getId();
        BugReport mine = bug("user");
        BugReport theirs = bug("admin");
        SalesInquiry myInquiry = inquiry("user");
        AiQuotaOverride q = new AiQuotaOverride();
        q.setLogin("user");
        q.setMonthlyBudgetCents(500);
        quotas.saveAndFlush(q);
        terms.accept(uid, "TERMS", "2026-10", "ACCOUNT", Instant.now());
        terms.accept(otherId, "TERMS", "2026-10", "ACCOUNT", Instant.now());
        DataExportJob job = new DataExportJob();
        job.setUserId(uid);
        job.setStatus(DataExportJob.QUEUED);
        job.setRequestedAt(Instant.now());
        exportJobs.saveAndFlush(job);
        String resumeFile = "resumes/" + uid + "/9101-erase-cv.pdf";
        String exportZip = "data-exports/" + uid + "/" + job.getId() + "-x-kiwiply-data.zip";
        String othersFile = "resumes/" + otherId + "/9102-erase-cv.pdf";
        storage.store(resumeFile, new byte[] { 1 }, "application/pdf");
        storage.store(exportZip, new byte[] { 2 }, "application/zip");
        storage.store(othersFile, new byte[] { 3 }, "application/pdf");
        filesToClean.add(othersFile);

        // the export carries what the person wrote to us and which terms they accepted
        Map<String, Object> exported = exportService.exportAccount("user");
        assertThat((List<?>) exported.get("bugReports")).hasSize(1);
        assertThat((List<?>) exported.get("salesInquiries")).hasSize(1);
        assertThat((List<?>) exported.get("termsAcceptance")).hasSize(1);

        Map<String, Long> before = census.take(uid, "user");
        assertThat(before).containsKeys("jhi_user", "bug_report", "sales_inquiry", "ai_quota_override", "terms_acceptance", "data_export_job", "files");

        deletion.deleteUserAccountByLogin("user");

        assertThat(users.findOneByLogin("user")).isEmpty();
        assertThat(bugReports.existsById(mine.getId())).isFalse();
        assertThat(inquiries.existsById(myInquiry.getId())).isFalse();
        assertThat(quotas.existsById("user")).isFalse();
        assertThat(count("select count(*) from terms_acceptance where user_id = ?", uid)).isZero();
        assertThat(count("select count(*) from data_export_job where user_id = ?", uid)).isZero();
        assertThat(storage.exists(resumeFile)).isFalse();
        assertThat(storage.exists(exportZip)).as("the export ZIP is a user file like the rest").isFalse();
        // somebody else's rows are untouched
        assertThat(bugReports.existsById(theirs.getId())).isTrue();
        assertThat(count("select count(*) from terms_acceptance where user_id = ?", otherId)).isEqualTo(1);
        assertThat(storage.exists(othersFile)).isTrue();

        AccountDeletionReport report = reports.findAllByOrderByIdDesc(PageRequest.of(0, 5)).stream().filter(r -> r.getSubjectRef().equals(uid)).findFirst().orElseThrow();
        assertThat(report.getStatus()).isEqualTo(AccountDeletionReport.COMPLETE);
        assertThat(report.getResidueCount()).isZero();
        assertThat(report.getSource()).isEqualTo("ADMIN");
        JsonNode removed = mapper.readTree(report.getSteps()).get("removed");
        assertThat(removed.get("bug_report").asLong()).isEqualTo(1);
        assertThat(removed.get("sales_inquiry").asLong()).isEqualTo(1);
        assertThat(removed.get("ai_quota_override").asLong()).isEqualTo(1);
        assertThat(removed.get("terms_acceptance").asLong()).isEqualTo(1);
        assertThat(removed.get("data_export_job").asLong()).isEqualTo(1);
        assertThat(removed.get("files").asLong()).isGreaterThanOrEqualTo(2);
        assertThat(census.take(uid, "user")).as("the census after the erasure is empty").isEmpty();
    }

    @Test
    @WithMockUser(username = "user")
    void theImmediateSelfServicePathWritesAReportToo() {
        Long uid = users.findOneByLogin("user").orElseThrow().getId();
        long before = reports.count();
        deletion.deleteCurrentUserAccount();
        assertThat(reports.count()).isEqualTo(before + 1);
        AccountDeletionReport report = reports.findAllByOrderByIdDesc(PageRequest.of(0, 1)).get(0);
        assertThat(report.getSubjectRef()).isEqualTo(uid);
        assertThat(report.getSource()).isEqualTo("IMMEDIATE");
        assertThat(report.getRequestedAt()).isNull();
    }
}
