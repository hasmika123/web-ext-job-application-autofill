package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ResumePdfJobService;
import com.dossier.api.service.ResumePdfJobService.ClaimedJob;
import com.dossier.api.service.ResumePdfJobService.FailKind;
import com.dossier.api.service.ResumePdfJobService.StoreResult;
import com.dossier.api.service.storage.FileStorage;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for the async PDF pipeline (Resume Builder R3.7, DESIGN 8.5): the render hash and the
 * PENDING marker a save leaves, the leased claim queue, the store/discard rules, the retry state machine,
 * the token-guarded internal routes, and the status/now endpoints the editor uses.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class ResumePdfJobIT {

    private static final String TOKEN = "test-internal-token";
    private static final byte[] PDF = "%PDF-1.7 test pdf bytes".getBytes();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private EntityManager em;

    @Autowired
    private ResumePdfJobService jobs;

    @Autowired
    private ResumeDocRepository docRepo;

    @Autowired
    private ResumeRepository resumeRepo;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FileStorage storage;

    @BeforeEach
    void emptyTheQueue() {
        // Other test classes may have left rows behind; this test only sees its own jobs.
        em.createQuery("update ResumeDoc d set d.pdfStatus = 'NONE', d.pdfNextAttemptAt = null, d.pdfLeaseUntil = null").executeUpdate();
    }

    // ---- helpers ------------------------------------------------------------

    private JsonNode json(String body) throws Exception {
        return om.readTree(body);
    }

    private Long createBuilt(String label) throws Exception {
        String res = mockMvc
            .perform(post("/api/profile/resumes/built").contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"" + label + "\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return json(res).at("/resume/id").asLong();
    }

    private JsonNode getDoc(Long id) throws Exception {
        return json(mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    /** Edit the summary so the content hash (and so the render hash) moves. */
    private void edit(Long id, String text) throws Exception {
        JsonNode dto = getDoc(id);
        var doc = (com.fasterxml.jackson.databind.node.ObjectNode) dto.get("doc").deepCopy();
        var section = om.createObjectNode().put("id", "s_sum0001").put("kind", "SUMMARY").put("title", "Summary").put("hidden", false);
        section.putArray("items").add(om.createObjectNode().put("id", "i_sum0001").put("text", text));
        doc.set("sections", om.createArrayNode().add(section));
        mockMvc
            .perform(
                put("/api/profile/resumes/" + id + "/doc")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header(HttpHeaders.IF_MATCH, "\"" + dto.get("docVersion").asInt() + "\"")
                    .content(om.writeValueAsString(Map.of("doc", doc)))
            )
            .andExpect(status().isOk());
    }

    private ResumeDoc row(Long id) {
        em.flush();
        em.clear();
        return docRepo.findById(id).orElseThrow();
    }

    private void makeDue(Long id) {
        em.createQuery("update ResumeDoc d set d.pdfNextAttemptAt = :t where d.resumeId = :id")
            .setParameter("t", Instant.now().minusSeconds(1))
            .setParameter("id", id)
            .executeUpdate();
    }

    private ClaimedJob claimOne(Long id, String worker) {
        makeDue(id);
        List<ClaimedJob> claimed = jobs.claim(worker, 1);
        assertThat(claimed).hasSize(1);
        assertThat(claimed.get(0).resumeId()).isEqualTo(id);
        return claimed.get(0);
    }

    private String renderHash(Long id) throws Exception {
        return getDoc(id).get("renderHash").asText();
    }

    // ---- saves leave a PENDING marker ----------------------------------------

    @Test
    void contentSaveSetsPendingWithTheSettleDelay() throws Exception {
        Long id = createBuilt("Settle");
        // pretend the first PDF exists and is current, so the next save is what queues work
        String hash = renderHash(id);
        docRepo.markReady(id, row(id).getDocVersion(), hash, Instant.now());
        assertThat(row(id).getPdfStatus()).isEqualTo("READY");

        Instant before = Instant.now();
        edit(id, "A different summary");
        ResumeDoc d = row(id);
        assertThat(d.getPdfStatus()).isEqualTo("PENDING");
        assertThat(d.getPdfRequestedAt()).isAfterOrEqualTo(before.minusSeconds(1));
        // default resume.pdf.settleMs = 15 s: next attempt is well in the future
        assertThat(d.getPdfNextAttemptAt()).isAfter(before.plus(Duration.ofSeconds(10)));
        assertThat(d.getPdfNextAttemptAt()).isBefore(before.plus(Duration.ofSeconds(30)));
        assertThat(d.getPdfAttempts()).isZero();

        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(jsonPath("$.pdf.status").value("PENDING"));
    }

    @Test
    void aNewResumeStartsPendingAndANewSaveMovesTheNextAttemptForward() throws Exception {
        Long id = createBuilt("Typing");
        assertThat(row(id).getPdfStatus()).isEqualTo("PENDING");
        Instant first = row(id).getPdfNextAttemptAt();
        Thread.sleep(20);
        edit(id, "typing continues");
        Instant second = row(id).getPdfNextAttemptAt();
        assertThat(second).isAfter(first);
        assertThat(row(id).getPdfStatus()).isEqualTo("PENDING");
    }

    @Test
    void templateSwitchIsACheckpointWithNoSettleDelay() throws Exception {
        Long id = createBuilt("Switch");
        docRepo.markReady(id, row(id).getDocVersion(), renderHash(id), Instant.now());

        Instant before = Instant.now();
        mockMvc
            .perform(patch("/api/profile/resumes/" + id + "/doc/template").contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":\"classic\"}"))
            .andExpect(status().isOk());
        ResumeDoc d = row(id);
        assertThat(d.getPdfStatus()).isEqualTo("PENDING");
        assertThat(d.getPdfNextAttemptAt()).isBeforeOrEqualTo(Instant.now().plusSeconds(1));
        assertThat(d.getPdfNextAttemptAt()).isAfterOrEqualTo(before.minusSeconds(1));
    }

    @Test
    void anEditThatIsUndoneLeavesTheStoredPdfCurrent() throws Exception {
        Long id = createBuilt("Undo");
        JsonNode original = getDoc(id);
        docRepo.markReady(id, row(id).getDocVersion(), original.get("renderHash").asText(), Instant.now());
        edit(id, "temporary change");
        assertThat(row(id).getPdfStatus()).isEqualTo("PENDING");

        // put the original document back: same content hash, same render hash as the stored PDF
        JsonNode now = getDoc(id);
        mockMvc
            .perform(
                put("/api/profile/resumes/" + id + "/doc")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header(HttpHeaders.IF_MATCH, "\"" + now.get("docVersion").asInt() + "\"")
                    .content(om.writeValueAsString(Map.of("doc", original.get("doc"))))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.pdf.status").value("READY"));
    }

    // ---- claim ---------------------------------------------------------------

    @Test
    void claimLeasesOneRowAndSkipsLeasedRows() throws Exception {
        Long a = createBuilt("A");
        Long b = createBuilt("B");
        makeDue(a);
        makeDue(b);
        em.createQuery("update ResumeDoc d set d.pdfRequestedAt = :t where d.resumeId = :id").setParameter("t", Instant.now().minusSeconds(60)).setParameter("id", a).executeUpdate();

        List<ClaimedJob> first = jobs.claim("w1", 5); // capped at resume.pdf.maxConcurrent (1)
        assertThat(first).hasSize(1);
        assertThat(first.get(0).resumeId()).isEqualTo(a); // oldest request first
        assertThat(first.get(0).renderHash()).isEqualTo(renderHash(a));
        assertThat(first.get(0).templateId()).isEqualTo("modern");
        ResumeDoc leased = row(a);
        assertThat(leased.getPdfStatus()).isEqualTo("RUNNING");
        assertThat(leased.getPdfWorker()).isEqualTo("w1");
        assertThat(leased.getPdfLeaseUntil()).isAfter(Instant.now().plusSeconds(60)); // default lease 120 s

        List<ClaimedJob> second = jobs.claim("w2", 1);
        assertThat(second).extracting(ClaimedJob::resumeId).containsExactly(b); // a is leased: skipped
        assertThat(jobs.claim("w3", 1)).isEmpty();
    }

    @Test
    void claimDoesNotTouchTheRowsNotYetDue() throws Exception {
        Long id = createBuilt("Later"); // PENDING, next attempt 15 s away
        assertThat(jobs.claim("w", 1)).isEmpty();
        assertThat(row(id).getPdfStatus()).isEqualTo("PENDING");
    }

    @Test
    void anExpiredLeaseIsReclaimableAndCountsAnAttempt() throws Exception {
        Long id = createBuilt("Lease");
        claimOne(id, "w1");
        assertThat(jobs.claim("w2", 1)).isEmpty(); // lease still valid

        em.createQuery("update ResumeDoc d set d.pdfLeaseUntil = :t where d.resumeId = :id").setParameter("t", Instant.now().minusSeconds(5)).setParameter("id", id).executeUpdate();
        List<ClaimedJob> again = jobs.claim("w2", 1);
        assertThat(again).extracting(ClaimedJob::resumeId).containsExactly(id);
        ResumeDoc d = row(id);
        assertThat(d.getPdfWorker()).isEqualTo("w2");
        assertThat(d.getPdfAttempts()).isEqualTo(1);
    }

    @Test
    void aLeaseThatExpiresOnTheLastAttemptFailsTheJob() throws Exception {
        Long id = createBuilt("Abandoned");
        claimOne(id, "w1");
        em.createQuery("update ResumeDoc d set d.pdfLeaseUntil = :t, d.pdfAttempts = 4 where d.resumeId = :id").setParameter("t", Instant.now().minusSeconds(5)).setParameter("id", id).executeUpdate();
        assertThat(jobs.claim("w2", 1)).isEmpty();
        assertThat(row(id).getPdfStatus()).isEqualTo("FAILED");
    }

    // ---- store ---------------------------------------------------------------

    @Test
    void storeWritesThroughFileStorageAndMarksReady() throws Exception {
        Long id = createBuilt("Jane Doe - Backend");
        int version = getDoc(id).get("docVersion").asInt();
        ClaimedJob job = claimOne(id, "w1");

        assertThat(jobs.store(id, PDF, job.renderHash(), 1, true)).isEqualTo(StoreResult.STORED);

        ResumeDoc d = row(id);
        assertThat(d.getPdfStatus()).isEqualTo("READY");
        assertThat(d.getExportedHash()).isEqualTo(job.renderHash());
        assertThat(d.getExportedAt()).isNotNull();
        assertThat(d.getPdfWorker()).isNull();
        assertThat(d.getPdfAttempts()).isZero();
        assertThat(d.getDocVersion()).as("the pipeline never bumps the document version").isEqualTo(version);

        Resume resume = resumeRepo.findById(id).orElseThrow();
        String key = resume.getr2ObjectKey();
        assertThat(key).startsWith("resumes/" + resume.getUser().getId() + "/" + id + "-").endsWith("-Jane-Doe-Backend.pdf");
        assertThat(storage.load(key).content()).isEqualTo(PDF);
        assertThat(storage.load(key).contentType()).isEqualTo("application/pdf");

        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(jsonPath("$.pdf.status").value("READY")).andExpect(jsonPath("$.pdf.hash").value(job.renderHash()));
    }

    @Test
    void storeWithAStaleRenderHashIsDiscarded() throws Exception {
        Long id = createBuilt("Stale");
        ClaimedJob job = claimOne(id, "w1");
        String before = resumeRepo.findById(id).orElseThrow().getr2ObjectKey();

        edit(id, "a newer save wins"); // re-queues the row under a new render hash
        assertThat(jobs.store(id, PDF, job.renderHash(), 1, true)).isEqualTo(StoreResult.DISCARDED);

        ResumeDoc d = row(id);
        assertThat(d.getPdfStatus()).isEqualTo("PENDING");
        assertThat(d.getExportedHash()).isNull();
        assertThat(resumeRepo.findById(id).orElseThrow().getr2ObjectKey()).isEqualTo(before);
    }

    @Test
    void aReplacedPdfDeletesTheOldObject() throws Exception {
        Long id = createBuilt("Replace");
        ClaimedJob first = claimOne(id, "w1");
        jobs.store(id, PDF, first.renderHash(), 1, true);
        String oldKey = resumeRepo.findById(id).orElseThrow().getr2ObjectKey();
        assertThat(storage.exists(oldKey)).isTrue();

        edit(id, "second version");
        ClaimedJob second = claimOne(id, "w1");
        assertThat(second.renderHash()).isNotEqualTo(first.renderHash());
        jobs.store(id, "%PDF second".getBytes(), second.renderHash(), 1, true);

        String newKey = resumeRepo.findById(id).orElseThrow().getr2ObjectKey();
        assertThat(newKey).isNotEqualTo(oldKey);
        assertThat(storage.exists(oldKey)).as("old object deleted (keepPrevious = 0)").isFalse();
        assertThat(storage.load(newKey).content()).isEqualTo("%PDF second".getBytes());
    }

    // ---- fail ----------------------------------------------------------------

    @Test
    void busyDoesNotCountAnAttempt() throws Exception {
        Long id = createBuilt("Busy");
        claimOne(id, "w1");
        Instant before = Instant.now();
        jobs.fail(id, "w1", FailKind.BUSY, "limiter full");
        ResumeDoc d = row(id);
        assertThat(d.getPdfStatus()).isEqualTo("PENDING");
        assertThat(d.getPdfAttempts()).isZero();
        assertThat(d.getPdfWorker()).isNull();
        assertThat(d.getPdfNextAttemptAt()).isAfter(before.plusSeconds(5)).isBefore(before.plusSeconds(20)); // resume.pdf.busyRetryMs = 10 s
    }

    @Test
    void errorsBackOffAndFiveOfThemFailTheJob() throws Exception {
        Long id = createBuilt("Errors");
        for (int i = 1; i <= 4; i++) {
            claimOne(id, "w1");
            Instant before = Instant.now();
            jobs.fail(id, "w1", i % 2 == 0 ? FailKind.TIMEOUT : FailKind.ERROR, "boom " + i);
            ResumeDoc d = row(id);
            assertThat(d.getPdfStatus()).isEqualTo("PENDING");
            assertThat(d.getPdfAttempts()).isEqualTo(i);
            assertThat(d.getPdfError()).isEqualTo("boom " + i);
            // backoff = min(900 s, 30 s * 2^attempts)
            long expected = Math.min(900, 30L * (1L << i));
            assertThat(Duration.between(before, d.getPdfNextAttemptAt()).toSeconds()).isBetween(expected - 2, expected + 2);
        }
        claimOne(id, "w1");
        jobs.fail(id, "w1", FailKind.ERROR, "last straw");
        ResumeDoc d = row(id);
        assertThat(d.getPdfStatus()).isEqualTo("FAILED");
        assertThat(d.getPdfAttempts()).isEqualTo(5);
        assertThat(d.getPdfError()).isEqualTo("last straw");
        assertThat(jobs.claim("w1", 1)).isEmpty(); // FAILED rows are not claimed

        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc/pdf-status")).andExpect(jsonPath("$.status").value("FAILED")).andExpect(jsonPath("$.error").value("last straw"));
    }

    @Test
    void aLateFailureFromAWorkerThatLostTheLeaseIsIgnored() throws Exception {
        Long id = createBuilt("Late");
        claimOne(id, "w1");
        edit(id, "newer save re-queues the row");
        jobs.fail(id, "w1", FailKind.ERROR, "too late");
        ResumeDoc d = row(id);
        assertThat(d.getPdfStatus()).isEqualTo("PENDING");
        assertThat(d.getPdfAttempts()).isZero();

        claimOne(id, "w2");
        jobs.fail(id, "w1", FailKind.ERROR, "wrong worker");
        assertThat(row(id).getPdfStatus()).isEqualTo("RUNNING");
    }

    // ---- editor endpoints -----------------------------------------------------

    @Test
    void pdfNowQueuesTheJobImmediatelyAndRetryClearsAFailedRow() throws Exception {
        Long id = createBuilt("Now");
        assertThat(row(id).getPdfNextAttemptAt()).isAfter(Instant.now().plusSeconds(5));
        mockMvc.perform(post("/api/profile/resumes/" + id + "/doc/pdf-now")).andExpect(status().isNoContent());
        assertThat(row(id).getPdfNextAttemptAt()).isBeforeOrEqualTo(Instant.now().plusSeconds(1));

        em.createQuery("update ResumeDoc d set d.pdfStatus = 'FAILED', d.pdfAttempts = 5, d.pdfError = 'x' where d.resumeId = :id").setParameter("id", id).executeUpdate();
        mockMvc.perform(post("/api/profile/resumes/" + id + "/doc/pdf-now")).andExpect(status().isNoContent());
        ResumeDoc d = row(id);
        assertThat(d.getPdfStatus()).isEqualTo("PENDING");
        assertThat(d.getPdfAttempts()).isZero();
        assertThat(d.getPdfError()).isNull();
    }

    @Test
    void pdfNowIsANoOpWhenTheStoredPdfIsCurrent() throws Exception {
        Long id = createBuilt("Current");
        ClaimedJob job = claimOne(id, "w1");
        jobs.store(id, PDF, job.renderHash(), 1, true);
        mockMvc.perform(post("/api/profile/resumes/" + id + "/doc/pdf-now")).andExpect(status().isNoContent());
        assertThat(row(id).getPdfStatus()).isEqualTo("READY");
    }

    @Test
    void pdfStatusCarriesThePollingHintsAndOwnershipIs404() throws Exception {
        Long id = createBuilt("Status");
        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/doc/pdf-status"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("PENDING"))
            .andExpect(jsonPath("$.pollMs").value(5000))
            .andExpect(jsonPath("$.pollWindowMs").value(180000));

        Long theirs = otherUsersBuiltResume();
        mockMvc.perform(get("/api/profile/resumes/" + theirs + "/doc/pdf-status")).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/profile/resumes/" + theirs + "/doc/pdf-now")).andExpect(status().isNotFound());
    }

    @Test
    void theResumeListCarriesThePdfStateAndItDerivesStale() throws Exception {
        Long id = createBuilt("List");
        ClaimedJob job = claimOne(id, "w1");
        jobs.store(id, PDF, job.renderHash(), 1, true);
        assertThat(listRow(id).path("pdf").path("status").asText()).isEqualTo("READY");

        // a theme change alters the render without touching the content hash: READY becomes STALE
        em.createQuery("update ResumeDoc d set d.themeJson = :t where d.resumeId = :id").setParameter("t", "{\"accent\":\"#2563eb\"}").setParameter("id", id).executeUpdate();
        JsonNode pdf = listRow(id).path("pdf");
        assertThat(pdf.path("status").asText()).isEqualTo("STALE");
        assertThat(pdf.path("hash").asText()).isEqualTo(job.renderHash());
    }

    @Test
    void exportRecordedWithTheCurrentRenderHashMarksTheRowReady() throws Exception {
        Long id = createBuilt("Sync export");
        String hash = renderHash(id);
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/export-recorded").contentType(MediaType.APPLICATION_JSON).content("{\"hash\":\"" + hash + "\"}"))
            .andExpect(status().isNoContent());
        ResumeDoc d = row(id);
        assertThat(d.getPdfStatus()).isEqualTo("READY");
        assertThat(d.getExportedHash()).isEqualTo(hash);

        // an older hash (the document moved on while it rendered) does not
        Long other = createBuilt("Sync export stale");
        mockMvc
            .perform(post("/api/profile/resumes/" + other + "/export-recorded").contentType(MediaType.APPLICATION_JSON).content("{\"hash\":\"" + "a".repeat(64) + "\"}"))
            .andExpect(status().isNoContent());
        assertThat(row(other).getPdfStatus()).isEqualTo("PENDING");
    }

    // ---- internal routes -------------------------------------------------------

    @Test
    void internalRoutesRefuseWithoutTheToken() throws Exception {
        Long id = createBuilt("Guarded");
        mockMvc.perform(post("/api/internal/resume-pdf-jobs/claim").contentType(MediaType.APPLICATION_JSON).content("{\"worker\":\"w\"}")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/internal/resume-pdf-jobs/claim").header("X-Internal-Token", "wrong").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/internal/resume-pdf-jobs/" + id + "/fail").contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"ERROR\"}")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/internal/resumes/" + id + "/doc")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/internal/resumes/" + id + "/photo")).andExpect(status().isUnauthorized());
        mockMvc
            .perform(multipart("/api/internal/resumes/" + id + "/pdf").file(new MockMultipartFile("file", "x.pdf", "application/pdf", PDF)).param("renderHash", "a".repeat(64)))
            .andExpect(status().isUnauthorized());
        assertThat(row(id).getPdfStatus()).isEqualTo("PENDING"); // nothing happened
    }

    @Test
    void theUserRoutesRefuseTheInternalToken() throws Exception {
        // the token is for /api/internal/** only
        mockMvc.perform(get("/api/profile/resumes").header("X-Internal-Token", TOKEN).with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous()))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void theWorkerFlowOverHttp() throws Exception {
        Long id = createBuilt("Over http");
        makeDue(id);

        String claimBody = mockMvc
            .perform(post("/api/internal/resume-pdf-jobs/claim").header("X-Internal-Token", TOKEN).contentType(MediaType.APPLICATION_JSON).content("{\"worker\":\"web-1\",\"limit\":1}"))
            .andExpect(status().isOk())
            .andExpect(header().string("X-Pdf-Poll-Ms", "5000"))
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode claimed = json(claimBody);
        assertThat(claimed).hasSize(1);
        assertThat(claimed.get(0).get("resumeId").asLong()).isEqualTo(id);
        String hash = claimed.get(0).get("renderHash").asText();

        mockMvc
            .perform(get("/api/internal/resumes/" + id + "/doc").header("X-Internal-Token", TOKEN))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.resumeId").value(id))
            .andExpect(jsonPath("$.renderHash").value(hash))
            .andExpect(jsonPath("$.doc.basics").exists());
        mockMvc.perform(get("/api/internal/resumes/" + id + "/photo").header("X-Internal-Token", TOKEN)).andExpect(status().isNotFound());

        // stale hash: 204 and discarded
        mockMvc
            .perform(multipart("/api/internal/resumes/" + id + "/pdf").file(new MockMultipartFile("file", "x.pdf", "application/pdf", PDF)).param("renderHash", "b".repeat(64)).header("X-Internal-Token", TOKEN))
            .andExpect(status().isNoContent());
        assertThat(row(id).getPdfStatus()).isEqualTo("RUNNING");

        // current hash: stored
        mockMvc
            .perform(
                multipart("/api/internal/resumes/" + id + "/pdf")
                    .file(new MockMultipartFile("file", "x.pdf", "application/pdf", PDF))
                    .param("renderHash", hash)
                    .param("pages", "2")
                    .param("fits", "false")
                    .header("X-Internal-Token", TOKEN)
            )
            .andExpect(status().isNoContent());
        assertThat(row(id).getPdfStatus()).isEqualTo("READY");

        // fail on a bad kind is a 400, a good one on a non-running row is a quiet 204
        mockMvc.perform(post("/api/internal/resume-pdf-jobs/" + id + "/fail").header("X-Internal-Token", TOKEN).contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"NOPE\"}")).andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/internal/resume-pdf-jobs/" + id + "/fail").header("X-Internal-Token", TOKEN).contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"ERROR\",\"worker\":\"web-1\"}")).andExpect(status().isNoContent());
        assertThat(row(id).getPdfStatus()).isEqualTo("READY");
    }

    // ---- admin -----------------------------------------------------------------

    @Test
    @WithMockUser(username = "user", authorities = AuthoritiesConstants.ADMIN)
    void adminStatsCountTheQueue() throws Exception {
        mockMvc.perform(get("/api/admin/resume-pdf-jobs/stats")).andExpect(status().isOk()).andExpect(jsonPath("$.pending").value(0)).andExpect(jsonPath("$.oldestPendingAge").doesNotExist());

        Long a = createBuilt("Queued A");
        createBuilt("Queued B");
        claimOne(a, "w1");
        em.createQuery("update ResumeDoc d set d.pdfRequestedAt = :t where d.pdfStatus = 'PENDING'").setParameter("t", Instant.now().minusSeconds(120)).executeUpdate();
        mockMvc
            .perform(get("/api/admin/resume-pdf-jobs/stats"))
            .andExpect(jsonPath("$.pending").value(1))
            .andExpect(jsonPath("$.running").value(1))
            .andExpect(jsonPath("$.failed").value(0))
            .andExpect(jsonPath("$.oldestPendingAge").value(org.hamcrest.Matchers.greaterThanOrEqualTo(119)));
    }

    @Test
    void adminStatsAreNotForOrdinaryUsers() throws Exception {
        mockMvc.perform(get("/api/admin/resume-pdf-jobs/stats")).andExpect(status().isForbidden());
    }

    // ---- unit-ish ----------------------------------------------------------------

    @Test
    void safeFileNamesAreAsciiAndBounded() throws Exception {
        var m = ResumePdfJobService.class.getDeclaredMethod("safeFileName", String.class, Long.class);
        m.setAccessible(true);
        assertThat(m.invoke(null, "Jane Doe - Backend", 7L)).isEqualTo("Jane-Doe-Backend.pdf");
        assertThat(m.invoke(null, "../../etc/passwd", 7L)).isEqualTo("etcpasswd.pdf");
        assertThat(m.invoke(null, "日本語", 7L)).isEqualTo("resume-7.pdf");
        assertThat(m.invoke(null, null, 7L)).isEqualTo("resume-7.pdf");
        assertThat(((String) m.invoke(null, "x".repeat(300), 7L))).hasSize(84);
    }

    // ---- fixtures ------------------------------------------------------------------

    private JsonNode listRow(Long id) throws Exception {
        String list = mockMvc.perform(get("/api/profile/resumes")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        for (JsonNode n : json(list)) if (n.path("id").asLong() == id) return n;
        throw new AssertionError("resume " + id + " is not in the list");
    }

    private Long otherUsersBuiltResume() throws Exception {
        User other = userRepository.findOneByLogin("admin").orElseThrow();
        Resume r = new Resume().label("Theirs").r2ObjectKey("").status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        r.setKind(ResumeKind.BUILT);
        r.setUser(other);
        r = resumeRepo.saveAndFlush(r);
        ResumeDoc d = new ResumeDoc();
        d.setResume(r);
        d.setUser(other);
        d.setDocJson("{\"schema\":2,\"meta\":{\"title\":\"Theirs\"},\"basics\":{\"name\":\"X\"},\"sections\":[]}");
        d.setThemeJson("{}");
        d.setContentHash("c".repeat(64));
        docRepo.saveAndFlush(d);
        return r.getId();
    }
}
