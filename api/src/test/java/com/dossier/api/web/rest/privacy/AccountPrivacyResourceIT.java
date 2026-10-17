package com.dossier.api.web.rest.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.User;
import com.dossier.api.domain.privacy.AccountDeletionReport;
import com.dossier.api.domain.privacy.AccountDeletionRequest;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.privacy.AccountDeletionReportRepository;
import com.dossier.api.repository.privacy.AccountDeletionRequestRepository;
import com.dossier.api.repository.privacy.DataExportJobRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.privacy.AccountDeletionRequestService;
import com.dossier.api.service.privacy.DataExportRunner;
import com.dossier.api.service.settings.AdminSettingKeys;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.StorageKeys;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The signed-in person's privacy routes (B2): the deletion undo window, the asynchronous export and the terms record. Every route is also attacked
 * as a SECOND account ("admin", an ordinary account here) to prove that nobody can see, cancel or download another account's request, job or file.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AccountPrivacyResourceIT {

    private static final String WHO = "privacy-it";

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserRepository users;
    @Autowired private AccountDeletionRequestRepository deletionRows;
    @Autowired private AccountDeletionReportRepository reports;
    @Autowired private AccountDeletionRequestService deletionRequests;
    @Autowired private DataExportRunner runner;
    @Autowired private DataExportJobRepository exportJobs;
    @Autowired private FileStorage storage;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings settings;

    /** Stripe is not what this test is about. */
    @MockitoBean private StripeGateway stripeGateway;

    private final java.util.List<String> filesToClean = new java.util.ArrayList<>();

    @AfterEach
    void cleanUp() {
        for (String key : filesToClean) storage.delete(key);
        settings.invalidate();
    }

    private Long id(String login) {
        return users.findOneByLogin(login).map(User::getId).orElseThrow();
    }

    private JsonNode json(MvcResult r) throws Exception {
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    // ---- deletion with an undo window ----------------------------------------------------------------------------------------------------

    @Test
    void aDeletionRequestWaitsOutItsWindowAndCanBeUndone() throws Exception {
        mvc.perform(get("/api/account/deletion-request").with(user("user"))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("NONE"));

        mvc
            .perform(post("/api/account/deletion-request").with(user("user")))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.status").value("PENDING"))
            .andExpect(jsonPath("$.graceHours").value(24))
            .andExpect(jsonPath("$.canUndo").value(true));
        AccountDeletionRequest row = deletionRows.findByUserId(id("user")).orElseThrow();
        assertThat(row.getPurgeAfter()).isAfter(Instant.now().plusSeconds(23 * 3600L)).isBefore(Instant.now().plusSeconds(25 * 3600L));

        // until the window ends nothing is erased, even when the sweep runs
        assertThat(deletionRequests.purgeDue(Instant.now())).isZero();
        assertThat(users.findOneByLogin("user")).isPresent();

        // asking twice is the same request
        mvc.perform(post("/api/account/deletion-request").with(user("user"))).andExpect(status().isAccepted()).andExpect(jsonPath("$.status").value("PENDING"));
        assertThat(deletionRows.count()).isEqualTo(1);

        // undo
        mvc.perform(delete("/api/account/deletion-request").with(user("user"))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        mvc.perform(get("/api/account/deletion-request").with(user("user"))).andExpect(jsonPath("$.status").value("NONE"));
        mvc.perform(delete("/api/account/deletion-request").with(user("user"))).andExpect(status().isNotFound());
        assertThat(deletionRequests.purgeDue(Instant.now().plusSeconds(48 * 3600L))).as("a cancelled request is never erased").isZero();
        assertThat(users.findOneByLogin("user")).isPresent();
    }

    @Test
    void whenTheWindowHasPassedTheSweepErasesTheAccountAndLeavesAPurgeReportWithNoIdentity() throws Exception {
        Long formerId = id("user");
        mvc.perform(post("/api/account/deletion-request").with(user("user"))).andExpect(status().isAccepted());
        AccountDeletionRequest row = deletionRows.findByUserId(formerId).orElseThrow();
        row.setPurgeAfter(Instant.now().minusSeconds(60));
        deletionRows.saveAndFlush(row);

        assertThat(deletionRequests.purgeDue(Instant.now())).isEqualTo(1);

        assertThat(users.findOneByLogin("user")).as("the account is gone").isEmpty();
        assertThat(deletionRows.findByUserId(formerId)).as("the request went with it").isEmpty();
        AccountDeletionReport report = reports.findAllByOrderByIdDesc(org.springframework.data.domain.PageRequest.of(0, 5)).stream().filter(r -> r.getSubjectRef().equals(formerId)).findFirst().orElseThrow();
        assertThat(report.getStatus()).isEqualTo(AccountDeletionReport.COMPLETE);
        assertThat(report.getResidueCount()).isZero();
        assertThat(report.getAccountKind()).isEqualTo("PERSONAL");
        assertThat(report.getSource()).isEqualTo("SELF");
        assertThat(report.getRequestedAt()).isNotNull();
        JsonNode steps = mapper.readTree(report.getSteps());
        assertThat(steps.get("removed").get("jhi_user").asLong()).isEqualTo(1);
        assertThat(report.getSteps()).as("counts only: no login, e-mail or name").doesNotContain("\"user\"").doesNotContain("@");
    }

    @Test
    void anotherAccountNeitherSeesNorCancelsMyRequest() throws Exception {
        mvc.perform(post("/api/account/deletion-request").with(user("user"))).andExpect(status().isAccepted());

        mvc.perform(get("/api/account/deletion-request").with(user("admin"))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("NONE"));
        mvc.perform(delete("/api/account/deletion-request").with(user("admin"))).andExpect(status().isNotFound());
        assertThat(deletionRows.findByUserId(id("user")).orElseThrow().getStatus()).isEqualTo(AccountDeletionRequest.PENDING);
    }

    @Test
    void aGraceOfZeroErasesAtOnceWithNoUndo() throws Exception {
        setting(AdminSettingKeys.PRIVACY_DELETION_GRACE_HOURS, "0");
        mvc.perform(post("/api/account/deletion-request").with(user("user"))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DELETED")).andExpect(jsonPath("$.canUndo").value(false));
        assertThat(users.findOneByLogin("user")).isEmpty();
    }

    @Test
    void theRoutesNeedASignedInAccount() throws Exception {
        mvc.perform(post("/api/account/deletion-request")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/account/exports")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/account/terms-acceptance")).andExpect(status().isUnauthorized());
    }

    // ---- the asynchronous export ------------------------------------------------------------------------------------------------------------

    @Test
    void anExportIsBuiltAsynchronouslyAndDownloadedThroughASignedLink() throws Exception {
        Long uid = id("user");
        String small = "resumes/" + uid + "/9001-it-cv.pdf";
        storage.store(small, "%PDF-small".getBytes(), "application/pdf");
        filesToClean.add(small);

        MvcResult started = mvc.perform(post("/api/account/exports").with(user("user"))).andExpect(status().isAccepted()).andExpect(jsonPath("$.status").value("QUEUED")).andReturn();
        long jobId = json(started).get("id").asLong();
        mvc.perform(post("/api/account/exports").with(user("user"))).andExpect(status().isAccepted()).andExpect(jsonPath("$.id").value(jobId)); // one active job at a time

        assertThat(runner.processDue(Instant.now())).isEqualTo(1);

        MvcResult ready = mvc.perform(get("/api/account/exports/" + jobId).with(user("user"))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("READY")).andReturn();
        JsonNode view = json(ready);
        String path = view.get("downloadPath").asText();
        assertThat(view.get("sizeBytes").asLong()).isPositive();
        assertThat(view.get("fileCount").asInt()).isGreaterThanOrEqualTo(1);
        filesToClean.add(exportJobs.findById(jobId).orElseThrow().getStorageKey());

        byte[] zip = mvc.perform(get(path).with(user("user"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        Map<String, byte[]> entries = unzip(zip);
        assertThat(entries).containsKeys("export.json", "manifest.json", "files/" + small);
        assertThat(new String(entries.get("files/" + small))).isEqualTo("%PDF-small");
        JsonNode export = mapper.readTree(entries.get("export.json"));
        assertThat(export.has("termsAcceptance")).isTrue();
        assertThat(mapper.readTree(entries.get("manifest.json")).get("skipped")).isEmpty();

        // the second account: the job does not exist for it, and the signed link is useless to it
        mvc.perform(get("/api/account/exports/" + jobId).with(user("admin"))).andExpect(status().isNotFound());
        mvc.perform(get(path).with(user("admin"))).andExpect(status().isNotFound());
        mvc.perform(get("/api/account/exports").with(user("admin"))).andExpect(jsonPath("$.length()").value(0));
        // a bent signature is no link
        mvc.perform(get(path + "x").with(user("user"))).andExpect(status().isNotFound());
        // and an export is not part of the next export
        assertThat(StorageKeys.exportablePrefixes(uid)).noneMatch(p -> p.startsWith(StorageKeys.DATA_EXPORTS));
    }

    @Test
    void theSizeCapLeavesOversizedFilesOutAndSaysSo() throws Exception {
        setting(AdminSettingKeys.PRIVACY_EXPORT_MAX_MB, "5");
        Long uid = id("user");
        String small = "resumes/" + uid + "/9002-it-small.pdf";
        String big = "resume-originals/" + uid + "/9002-it-big.docx";
        storage.store(small, new byte[100], "application/pdf");
        storage.store(big, new byte[6 * 1024 * 1024], "application/octet-stream");
        filesToClean.add(small);
        filesToClean.add(big);

        long jobId = json(mvc.perform(post("/api/account/exports").with(user("user"))).andExpect(status().isAccepted()).andReturn()).get("id").asLong();
        runner.processDue(Instant.now());
        JsonNode view = json(mvc.perform(get("/api/account/exports/" + jobId).with(user("user"))).andReturn());
        assertThat(view.get("status").asText()).isEqualTo("READY");
        assertThat(view.get("skippedCount").asInt()).isEqualTo(1);
        filesToClean.add(exportJobs.findById(jobId).orElseThrow().getStorageKey());

        Map<String, byte[]> entries = unzip(mvc.perform(get(view.get("downloadPath").asText()).with(user("user"))).andReturn().getResponse().getContentAsByteArray());
        assertThat(entries).containsKey("files/" + small).doesNotContainKey("files/" + big);
        JsonNode skipped = mapper.readTree(entries.get("manifest.json")).get("skipped");
        assertThat(skipped).hasSize(1);
        assertThat(skipped.get(0).get("path").asText()).isEqualTo(big);
        assertThat(skipped.get(0).get("reason").asText()).contains("size cap");
    }

    @Test
    void aFinishedExportExpiresAndItsFileIsDeleted() throws Exception {
        long jobId = json(mvc.perform(post("/api/account/exports").with(user("user"))).andReturn()).get("id").asLong();
        runner.processDue(Instant.now());
        String key = exportJobs.findById(jobId).orElseThrow().getStorageKey();
        filesToClean.add(key);
        assertThat(storage.exists(key)).isTrue();

        assertThat(runner.expire(Instant.now())).as("not yet").isZero();
        assertThat(runner.expire(Instant.now().plusSeconds(73 * 3600L))).isEqualTo(1);
        assertThat(storage.exists(key)).isFalse();
        mvc.perform(get("/api/account/exports/" + jobId).with(user("user"))).andExpect(jsonPath("$.status").value("EXPIRED")).andExpect(jsonPath("$.downloadPath").doesNotExist());
    }

    // ---- terms acceptance -------------------------------------------------------------------------------------------------------------------

    @Test
    void theTermsAcceptanceIsRecordedPerAccountWithVersionAndTime() throws Exception {
        mvc.perform(get("/api/account/terms-acceptance").with(user("user"))).andExpect(status().isOk()).andExpect(jsonPath("$.upToDate").value(false)).andExpect(jsonPath("$.terms.currentVersion").value("2026-10"));

        mvc.perform(post("/api/account/terms-acceptance").with(user("user")).contentType(MediaType.APPLICATION_JSON).content("{\"document\":\"TERMS\",\"version\":\"2026-10\",\"source\":\"SIGNUP\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.terms.accepted").value(true))
            .andExpect(jsonPath("$.terms.lastAcceptedAt").isNotEmpty())
            .andExpect(jsonPath("$.upToDate").value(false));
        mvc.perform(post("/api/account/terms-acceptance").with(user("user")).contentType(MediaType.APPLICATION_JSON).content("{\"document\":\"PRIVACY\",\"version\":\"2026-10\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.upToDate").value(true));

        // a version that is not in force proves nothing
        mvc.perform(post("/api/account/terms-acceptance").with(user("user")).contentType(MediaType.APPLICATION_JSON).content("{\"document\":\"TERMS\",\"version\":\"1999-01\"}")).andExpect(status().isBadRequest());

        // the other account is its own record
        mvc.perform(get("/api/account/terms-acceptance").with(user("admin"))).andExpect(jsonPath("$.upToDate").value(false)).andExpect(jsonPath("$.terms.accepted").value(false));
    }

    private void setting(String key, String value) {
        settingRows.saveAndFlush(new AppSetting(key, value, WHO, Instant.now()));
        settings.invalidate();
    }

    private static Map<String, byte[]> unzip(byte[] zip) throws IOException {
        Map<String, byte[]> out = new HashMap<>();
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry e;
            while ((e = in.getNextEntry()) != null) out.put(e.getName(), in.readAllBytes());
        }
        return out;
    }
}
