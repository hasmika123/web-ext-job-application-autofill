package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeAccess;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.ResumeViewEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.ResumeAccessRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.ResumeViewEventRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ResumeBuilderDataService;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ResumeDocService;
import com.dossier.api.service.resume.ResumePdfState;
import com.dossier.api.service.storage.FileStorage;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for resume access control (Resume Builder R3.11): grants to people, share links, the public
 * page and PDF behind a link, the view audit, the metadata switches, and above all the security properties - a
 * stranger, a revoked grant, an expired grant or link, an unknown token and a resume id that does not exist are
 * indistinguishable (404), and a link viewer leaves no identity behind.
 *
 * <p>The owner is {@code user} (the class-level mock user); the grantee is the seeded {@code admin} account.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class ResumeAccessResourceIT {

    private static final byte[] PDF = "%PDF-1.4 share test".getBytes();
    private static final AtomicInteger IP = new AtomicInteger(1);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private ResumeDocRepository resumeDocRepository;

    @Autowired
    private ResumeAccessRepository accessRepository;

    @Autowired
    private ResumeViewEventRepository viewRepository;

    @Autowired
    private AppSettingRepository appSettingRepository;

    @Autowired
    private ResumeBuilderSettings settings;

    @Autowired
    private ResumeBuilderDataService dataService;

    @Autowired
    private FileStorage storage;

    @Autowired
    private jakarta.persistence.EntityManager em;

    @AfterEach
    void dropSettingsCache() {
        settings.invalidate(); // the setting rows roll back with the test transaction; the cache must not outlive them
    }

    // ---- helpers ------------------------------------------------------------

    private void setting(String key, String value) {
        appSettingRepository.saveAndFlush(new AppSetting(key, value, "it", Instant.now()));
        settings.invalidate();
    }

    private JsonNode json(String body) throws Exception {
        return om.readTree(body);
    }

    private static String freshIp() {
        return "198.51.100." + IP.getAndIncrement();
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

    private Long createUploaded(String label) throws Exception {
        String res = mockMvc
            .perform(post("/api/profile/resumes").contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"" + label + "\",\"status\":\"NEEDS_REVIEW\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return json(res).get("id").asLong();
    }

    /** A built resume belonging to {@code admin}, written straight through the repositories. */
    private Long adminsBuiltResume() {
        User other = userRepository.findOneByLogin("admin").orElseThrow();
        Resume r = new Resume().label("Theirs").r2ObjectKey("").status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        r.setKind(ResumeKind.BUILT);
        r.setUser(other);
        r = resumeRepository.saveAndFlush(r);
        ResumeDoc d = new ResumeDoc();
        d.setResume(r);
        d.setUser(other);
        d.setDocJson("{\"schema\":2,\"meta\":{\"title\":\"Theirs\"},\"basics\":{\"name\":\"Ada\"},\"sections\":[]}");
        d.setThemeJson("{}");
        d.setContentHash("0".repeat(64));
        resumeDocRepository.saveAndFlush(d);
        return r.getId();
    }

    private MockHttpServletRequestBuilder asAdmin(MockHttpServletRequestBuilder b) {
        return b.with(user("admin"));
    }

    private ResultActions publicGet(String path, String ip) throws Exception {
        return mockMvc.perform(get(path).with(anonymous()).header("X-Forwarded-For", ip));
    }

    private ResultActions publicGet(String path) throws Exception {
        return publicGet(path, freshIp());
    }

    private JsonNode grant(Long id, String body) throws Exception {
        return json(
            mockMvc
                .perform(post("/api/profile/resumes/" + id + "/access").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString()
        );
    }

    private JsonNode link(Long id, String body) throws Exception {
        return json(
            mockMvc
                .perform(post("/api/profile/resumes/" + id + "/access/link").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString()
        );
    }

    private static String tokenOf(JsonNode link) {
        String url = link.get("url").asText();
        return url.substring(url.lastIndexOf("/r/") + 3);
    }

    private JsonNode meta(Long id) throws Exception {
        return json(mockMvc.perform(get("/api/profile/resumes/" + id + "/meta")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions patchMeta(Long id, String body) throws Exception {
        return mockMvc.perform(patch("/api/profile/resumes/" + id + "/meta").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private List<ResumeViewEvent> events(Long resumeId) {
        em.flush();
        em.clear();
        return viewRepository.findAll().stream().filter(e -> e.getResumeId().equals(resumeId)).toList();
    }

    /** A problem body without the echoed request path: everything else must be identical between two refusals. */
    private String sameProblem(String body) throws Exception {
        com.fasterxml.jackson.databind.node.ObjectNode n = (com.fasterxml.jackson.databind.node.ObjectNode) json(body);
        n.remove("instance");
        n.remove("path");
        return n.toString();
    }

    private List<ResumeAccess> accessFor(Long resumeId) {
        em.flush();
        em.clear();
        return accessRepository.findAll().stream().filter(a -> a.getResumeId().equals(resumeId)).toList();
    }

    private void makeCurrentPdf(Long id) {
        ResumeDoc d = resumeDocRepository.findById(id).orElseThrow();
        Resume r = d.getResume();
        String key = storage.objectKeyFor(r.getUser().getId(), id, "resume.pdf");
        storage.store(key, PDF, "application/pdf");
        r.setr2ObjectKey(key);
        resumeRepository.saveAndFlush(r);
        d.setPdfStatus(ResumePdfState.READY);
        d.setExportedHash(ResumeDocService.renderHash(d));
        d.setExportedAt(Instant.now());
        resumeDocRepository.saveAndFlush(d);
    }

    // ---- ownership: a stranger sees nothing --------------------------------------------------------

    @Test
    void anotherUsersResumeIs404OnEveryOwnerRoute() throws Exception {
        Long theirs = adminsBuiltResume();
        mockMvc.perform(get("/api/profile/resumes/" + theirs + "/access")).andExpect(status().isNotFound());
        mockMvc
            .perform(post("/api/profile/resumes/" + theirs + "/access").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"user@localhost\"}"))
            .andExpect(status().isNotFound());
        mockMvc.perform(post("/api/profile/resumes/" + theirs + "/access/link").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/profile/resumes/" + theirs + "/access/1")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/profile/resumes/" + theirs + "/views")).andExpect(status().isNotFound());
        patchMeta(theirs, "{\"recruiterSharing\":true}").andExpect(status().isNotFound());
        patchMeta(theirs, "{\"visibility\":\"PRIVATE\"}").andExpect(status().isNotFound());
        // ...and as a non-grantee, the viewer routes say exactly the same
        mockMvc.perform(get("/api/profile/resumes/shared/" + theirs + "/doc")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/profile/resumes/shared/" + theirs + "/export?format=pdf")).andExpect(status().isNotFound());
        assertThat(accessFor(theirs)).isEmpty();
    }

    @Test
    void aResumeThatDoesNotExistLooksExactlyLikeOneYouMayNotRead() throws Exception {
        Long mine = createBuilt("Mine");
        String missing = mockMvc.perform(get("/api/profile/resumes/shared/999999999/doc")).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        String forbidden = mockMvc.perform(get("/api/profile/resumes/shared/" + adminsBuiltResume() + "/doc")).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        assertThat(sameProblem(forbidden)).isEqualTo(sameProblem(missing));
        assertThat(mine).isNotNull();
    }

    // ---- grants to people -------------------------------------------------------------------------

    @Test
    void grantThenReadThenRevoke() throws Exception {
        Long id = createBuilt("Backend");
        JsonNode g = grant(id, "{\"email\":\"Admin@Localhost\",\"label\":\"My friend\"}");
        assertThat(g.get("subjectType").asText()).isEqualTo("USER");
        assertThat(g.get("login").asText()).isEqualTo("admin");
        assertThat(g.get("role").asText()).isEqualTo("VIEW");
        assertThat(g.has("url")).isFalse();
        long accessId = g.get("id").asLong();

        // the grantee sees it listed and reads it (read-only: no ETag, scrubbed)
        mockMvc
            .perform(asAdmin(get("/api/profile/resumes/shared-with-me")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].resumeId").value(id))
            .andExpect(jsonPath("$[0].name").value("Backend"))
            .andExpect(jsonPath("$[0].via").value("USER"));
        MvcResult read = mockMvc
            .perform(asAdmin(get("/api/profile/resumes/shared/" + id + "/doc")))
            .andExpect(status().isOk())
            .andExpect(header().doesNotExist("ETag"))
            .andExpect(jsonPath("$.resumeId").value(id))
            .andReturn();
        JsonNode body = json(read.getResponse().getContentAsString());
        assertThat(body.at("/doc/meta/target").isMissingNode()).isTrue();
        assertThat(body.get("contentHash").isNull()).isTrue();

        // the audit row: a USER view naming the grantee, and the owner can read it
        List<ResumeViewEvent> evs = events(id);
        assertThat(evs).hasSize(1);
        assertThat(evs.get(0).getViewerKind()).isEqualTo("USER");
        assertThat(evs.get(0).getViewerLogin()).isEqualTo("admin");
        assertThat(evs.get(0).getAccessId()).isEqualTo(accessId);
        assertThat(evs.get(0).getWhat()).isEqualTo("PAGE");
        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/views"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].viewerKind").value("USER"))
            .andExpect(jsonPath("$[0].what").value("PAGE"));

        // revoke: idempotent, and the grantee is locked out - with the same 404 a stranger gets
        mockMvc.perform(delete("/api/profile/resumes/" + id + "/access/" + accessId)).andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/profile/resumes/" + id + "/access/" + accessId)).andExpect(status().isNoContent());
        mockMvc.perform(asAdmin(get("/api/profile/resumes/shared/" + id + "/doc"))).andExpect(status().isNotFound());
        mockMvc.perform(asAdmin(get("/api/profile/resumes/shared-with-me"))).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void ownerReadingTheirOwnResumeIsNotRecorded() throws Exception {
        Long id = createBuilt("Mine");
        mockMvc.perform(get("/api/profile/resumes/shared/" + id + "/doc")).andExpect(status().isOk());
        assertThat(events(id)).isEmpty();
    }

    @Test
    void grantRefusals() throws Exception {
        Long id = createBuilt("Mine");
        // no such account
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/access").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"nobody@nowhere.example\"}"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
        // yourself, a malformed email, a past expiry, a role that is not available
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/access").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"user@localhost\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ACCESS_INVALID"));
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/access").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"not-an-email\"}"))
            .andExpect(status().isUnprocessableEntity());
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/access").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"admin@localhost\",\"expiresAt\":\"2020-01-01T00:00:00Z\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ACCESS_INVALID"));
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/access").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"admin@localhost\",\"role\":\"EDIT\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ROLE_NOT_AVAILABLE"));
        // a label may not carry a never-collected value
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/access").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"admin@localhost\",\"label\":\"SSN 123-45-6789\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"));
        // twice
        grant(id, "{\"email\":\"admin@localhost\"}");
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/access").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"admin@localhost\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ALREADY_GRANTED"));
        // an uploaded file has no page to share
        Long uploaded = createUploaded("A file");
        mockMvc
            .perform(post("/api/profile/resumes/" + uploaded + "/access").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"admin@localhost\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("NOT_SHAREABLE"));
        mockMvc
            .perform(post("/api/profile/resumes/" + uploaded + "/access/link").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("NOT_SHAREABLE"));
    }

    @Test
    void maxGrantsIsASettingAndRefusesWithLimit() throws Exception {
        setting(ResumeBuilderSettingKeys.SHARE_MAX_GRANTS, "1");
        Long id = createBuilt("Mine");
        // a second account to grant to
        User second = new User();
        second.setLogin("second-grantee");
        second.setEmail("second@localhost");
        second.setPassword("x".repeat(60));
        second.setActivated(true);
        second.setLangKey("en");
        userRepository.saveAndFlush(second);
        grant(id, "{\"email\":\"admin@localhost\"}");
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/access").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"second@localhost\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("LIMIT"));
    }

    @Test
    void anExpiredGrantOpensNothing() throws Exception {
        Long id = createBuilt("Mine");
        JsonNode g = grant(id, "{\"email\":\"admin@localhost\",\"expiresAt\":\"" + Instant.now().plus(1, ChronoUnit.DAYS) + "\"}");
        mockMvc.perform(asAdmin(get("/api/profile/resumes/shared/" + id + "/doc"))).andExpect(status().isOk());
        ResumeAccess row = accessRepository.findById(g.get("id").asLong()).orElseThrow();
        row.setExpiresAt(Instant.now().minus(1, ChronoUnit.MINUTES));
        accessRepository.saveAndFlush(row);
        mockMvc.perform(asAdmin(get("/api/profile/resumes/shared/" + id + "/doc"))).andExpect(status().isNotFound());
        mockMvc.perform(asAdmin(get("/api/profile/resumes/shared-with-me"))).andExpect(jsonPath("$.length()").value(0));
        // the owner still sees it, flagged expired, until they remove it; it does not count against the limit
        mockMvc.perform(get("/api/profile/resumes/" + id + "/access")).andExpect(jsonPath("$.grants[0].expired").value(true));
    }

    @Test
    void theExtensionListNeverContainsASharedResume() throws Exception {
        Long id = createBuilt("Mine");
        grant(id, "{\"email\":\"admin@localhost\"}");
        link(id, "{}");
        // the extension pulls GET /api/profile/resumes: as the grantee it holds none of its own, and not the shared one
        JsonNode list = json(mockMvc.perform(asAdmin(get("/api/profile/resumes"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for (JsonNode r : list) assertThat(r.get("id").asLong()).isNotEqualTo(id);
        // the owner's list still has theirs
        JsonNode mine = json(mockMvc.perform(get("/api/profile/resumes")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(mine.findValuesAsText("label")).contains("Mine");
    }

    // ---- links and the public page ------------------------------------------------------------------

    @Test
    void linkLifecycleCreateOpenAuditRevoke() throws Exception {
        Long id = createBuilt("Backend");
        JsonNode l = link(id, "{\"label\":\"Sent to recruiter at Acme\"}");
        String token = tokenOf(l);
        assertThat(token).matches("[0-9A-Za-z]{32}");
        assertThat(l.get("subjectType").asText()).isEqualTo("LINK");
        assertThat(l.get("allowDownload").asBoolean()).isFalse(); // resume.share.allowDownloadDefault
        assertThat(l.get("expiresAt").asText()).isNotBlank(); // resume.share.linkDefaultDays (30)
        assertThat(l.has("login")).isFalse();

        // anyone, with no login, opens exactly the page - and it is not for search engines
        MvcResult page = publicGet("/api/public/resumes/" + token)
            .andExpect(status().isOk())
            .andExpect(header().string("X-Robots-Tag", "noindex, nofollow"))
            .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
            .andExpect(jsonPath("$.name").value("Backend"))
            .andExpect(jsonPath("$.allowDownload").value(false))
            .andExpect(jsonPath("$.pdfReady").value(false))
            .andExpect(jsonPath("$.templateId").value("modern"))
            .andReturn();
        JsonNode body = json(page.getResponse().getContentAsString());
        assertThat(body.at("/doc/meta/target").isMissingNode()).isTrue();
        assertThat(body.at("/doc/basics/photo").isMissingNode()).isTrue();
        // nothing that identifies the owner's account or storage leaks into the page
        assertThat(page.getResponse().getContentAsString()).doesNotContain("resume-photos/").doesNotContain("contentHash");

        // the audit: one anonymous LINK view, tied to the link, no login, and the count moved
        List<ResumeViewEvent> evs = events(id);
        assertThat(evs).hasSize(1);
        assertThat(evs.get(0).getViewerKind()).isEqualTo("LINK");
        assertThat(evs.get(0).getViewerLogin()).isNull();
        assertThat(evs.get(0).getAccessId()).isEqualTo(l.get("id").asLong());
        assertThat(accessRepository.findById(l.get("id").asLong()).orElseThrow().getViewCount()).isEqualTo(1);
        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/views"))
            .andExpect(jsonPath("$[0].viewerKind").value("LINK"))
            .andExpect(jsonPath("$[0].viewerLabel").value("Link: Sent to recruiter at Acme"));
        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/access"))
            .andExpect(jsonPath("$.links[0].viewCount").value(1))
            .andExpect(jsonPath("$.viewers").value(1));

        // revoke -> the very same URL is a 404
        mockMvc.perform(delete("/api/profile/resumes/" + id + "/access/" + l.get("id").asLong())).andExpect(status().isNoContent());
        publicGet("/api/public/resumes/" + token).andExpect(status().isNotFound());
        assertThat(events(id)).hasSize(1); // a refused read writes no event
    }

    @Test
    void revokedExpiredAndUnknownLinksAreIndistinguishable() throws Exception {
        Long id = createBuilt("Backend");
        JsonNode revoked = link(id, "{}");
        JsonNode expired = link(id, "{}");
        mockMvc.perform(delete("/api/profile/resumes/" + id + "/access/" + revoked.get("id").asLong())).andExpect(status().isNoContent());
        ResumeAccess row = accessRepository.findById(expired.get("id").asLong()).orElseThrow();
        row.setExpiresAt(Instant.now().minus(1, ChronoUnit.SECONDS));
        accessRepository.saveAndFlush(row);

        String unknown = publicGet("/api/public/resumes/" + "A".repeat(32)).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        String r = publicGet("/api/public/resumes/" + tokenOf(revoked)).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        String e = publicGet("/api/public/resumes/" + tokenOf(expired)).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        String malformed = publicGet("/api/public/resumes/short").andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        assertThat(sameProblem(r)).isEqualTo(sameProblem(unknown));
        assertThat(sameProblem(e)).isEqualTo(sameProblem(unknown));
        assertThat(sameProblem(malformed)).isEqualTo(sameProblem(unknown));
        // and a user's own token or someone else's resume id is not a way in either
        publicGet("/api/public/resumes/" + id).andExpect(status().isNotFound());
        publicGet("/api/public/resumes/" + tokenOf(revoked) + "/pdf").andExpect(status().isNotFound());
    }

    @Test
    void theOwnersRoutesAreNotReachableThroughTheLinkToken() throws Exception {
        Long id = createBuilt("Backend");
        String token = tokenOf(link(id, "{}"));
        // the token opens the public route only: no editor, no owner API, no write
        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc").with(anonymous())).andExpect(status().isUnauthorized());
        mockMvc
            .perform(get("/api/profile/resumes/shared/" + id + "/doc").with(anonymous()).header("X-Forwarded-For", freshIp()))
            .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/public/resumes/" + token).with(anonymous())).andExpect(status().is4xxClientError());
    }

    @Test
    void linkLimitAndTheKillSwitchAreSettings() throws Exception {
        setting(ResumeBuilderSettingKeys.SHARE_MAX_LINKS, "1");
        Long id = createBuilt("Backend");
        JsonNode first = link(id, "{}");
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/access/link").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("LIMIT"));

        // switch share links off: creating is 403, and every existing link goes dark at once
        setting(ResumeBuilderSettingKeys.FEATURE_SHARE_LINKS, "false");
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/access/link").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("FEATURE_DISABLED"));
        publicGet("/api/public/resumes/" + tokenOf(first)).andExpect(status().isNotFound());
        setting(ResumeBuilderSettingKeys.FEATURE_SHARE_LINKS, "true");
        publicGet("/api/public/resumes/" + tokenOf(first)).andExpect(status().isOk());
    }

    @Test
    void linkDefaultsComeFromSettings() throws Exception {
        setting(ResumeBuilderSettingKeys.SHARE_LINK_DEFAULT_DAYS, "0");
        setting(ResumeBuilderSettingKeys.SHARE_ALLOW_DOWNLOAD_DEFAULT, "true");
        Long id = createBuilt("Backend");
        JsonNode l = link(id, "{}");
        assertThat(l.has("expiresAt")).isFalse(); // 0 = never
        assertThat(l.get("allowDownload").asBoolean()).isTrue();
        // an explicit value wins; a past one is refused
        JsonNode n = link(id, "{\"allowDownload\":false,\"expiresAt\":\"" + Instant.now().plus(2, ChronoUnit.DAYS) + "\"}");
        assertThat(n.get("allowDownload").asBoolean()).isFalse();
        assertThat(n.get("expiresAt").asText()).isNotBlank();
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/access/link").contentType(MediaType.APPLICATION_JSON).content("{\"expiresAt\":\"2020-01-01T00:00:00Z\"}"))
            .andExpect(status().isUnprocessableEntity());
    }

    // ---- the PDF through a link --------------------------------------------------------------------

    @Test
    void pdfNeedsAllowDownloadAndAReadyCurrentFile() throws Exception {
        Long id = createBuilt("Backend");
        String closed = tokenOf(link(id, "{\"allowDownload\":false}"));
        String open = tokenOf(link(id, "{\"allowDownload\":true}"));
        // download not allowed: a plain 404, even once the PDF exists
        makeCurrentPdf(id);
        publicGet("/api/public/resumes/" + closed + "/pdf").andExpect(status().isNotFound());
        // allowed and current: the stored bytes, and a PDF view is audited
        MvcResult res = publicGet("/api/public/resumes/" + open + "/pdf")
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", "application/pdf"))
            .andExpect(header().string("X-Robots-Tag", "noindex, nofollow"))
            .andReturn();
        assertThat(res.getResponse().getContentAsByteArray()).isEqualTo(PDF);
        publicGet("/api/public/resumes/" + open).andExpect(jsonPath("$.pdfReady").value(true));
        assertThat(events(id)).extracting(ResumeViewEvent::getWhat).containsExactlyInAnyOrder("PDF", "PAGE");

        // the document moves on: the stored PDF is behind, so the link says "being prepared" instead of serving old content
        ResumeDoc d = resumeDocRepository.findById(id).orElseThrow();
        d.setContentHash("f".repeat(64));
        resumeDocRepository.saveAndFlush(d);
        publicGet("/api/public/resumes/" + open + "/pdf").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PDF_NOT_READY"));
        publicGet("/api/public/resumes/" + open).andExpect(jsonPath("$.pdfReady").value(false));
    }

    @Test
    void sharedPdfForAGranteeFollowsTheSameRule() throws Exception {
        Long id = createBuilt("Backend");
        grant(id, "{\"email\":\"admin@localhost\"}");
        mockMvc.perform(asAdmin(get("/api/profile/resumes/shared/" + id + "/export?format=pdf"))).andExpect(status().isConflict());
        makeCurrentPdf(id);
        MvcResult res = mockMvc.perform(asAdmin(get("/api/profile/resumes/shared/" + id + "/export?format=pdf"))).andExpect(status().isOk()).andReturn();
        assertThat(res.getResponse().getContentAsByteArray()).isEqualTo(PDF);
        mockMvc.perform(asAdmin(get("/api/profile/resumes/shared/" + id + "/export?format=docx"))).andExpect(status().isBadRequest());
        // a stranger gets nothing of it
        mockMvc.perform(get("/api/profile/resumes/shared/" + adminsBuiltResume() + "/export?format=pdf")).andExpect(status().isNotFound());
    }

    // ---- rate limits ---------------------------------------------------------------------------------

    @Test
    void publicRequestsAreRateLimitedPerVisitorAndToken() throws Exception {
        setting(ResumeBuilderSettingKeys.RATE_PUBLIC_PER_MIN, "10");
        Long id = createBuilt("Backend");
        String token = tokenOf(link(id, "{}"));
        String ip = freshIp();
        for (int i = 0; i < 10; i++) publicGet("/api/public/resumes/" + token, ip).andExpect(status().isOk());
        publicGet("/api/public/resumes/" + token, ip).andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));
        // another visitor is unaffected
        publicGet("/api/public/resumes/" + token, freshIp()).andExpect(status().isOk());
    }

    @Test
    void walkingTokensIsRateLimitedPerVisitor() throws Exception {
        setting(ResumeBuilderSettingKeys.RATE_PUBLIC_PER_MIN, "10");
        String ip = freshIp();
        for (int i = 0; i < 10; i++) publicGet("/api/public/resumes/" + String.format("%032d", i), ip).andExpect(status().isNotFound());
        publicGet("/api/public/resumes/" + String.format("%032d", 99), ip).andExpect(status().isTooManyRequests());
    }

    // ---- metadata: visibility and Shared with Recruiters ---------------------------------------------

    @Test
    void metaStartsPrivateAndReportsRealNumbers() throws Exception {
        Long id = createBuilt("Backend");
        JsonNode m = meta(id);
        assertThat(m.at("/visibility/mode").asText()).isEqualTo("PRIVATE");
        assertThat(m.at("/visibility/people").asInt()).isZero();
        assertThat(m.at("/visibility/shareWithOrg").asBoolean()).isTrue(); // resume.meta.shareWithOrgDefault; scope is not FULL
        assertThat(m.at("/visibility/orgScope").isNull()).isTrue(); // no org area -> nothing public, nothing org
        assertThat(m.at("/recruiterSharing/on").asBoolean()).isFalse();

        grant(id, "{\"email\":\"admin@localhost\"}");
        link(id, "{}");
        publicGet("/api/public/resumes/" + tokenOf(json(mockMvc.perform(get("/api/profile/resumes/" + id + "/access")).andReturn().getResponse().getContentAsString()).at("/links/0"))).andExpect(status().isOk());
        JsonNode after = meta(id);
        assertThat(after.at("/visibility/mode").asText()).isEqualTo("PEOPLE");
        assertThat(after.at("/visibility/people").asInt()).isEqualTo(1);
        assertThat(after.at("/recruiterSharing/on").asBoolean()).isTrue();
        assertThat(after.at("/recruiterSharing/links").asInt()).isEqualTo(1);
        assertThat(after.at("/recruiterSharing/views").asInt()).isEqualTo(1);
    }

    @Test
    void recruiterSharingSwitchCreatesTheDefaultLinkOnceAndRevokesAll() throws Exception {
        Long id = createBuilt("Backend");
        patchMeta(id, "{\"recruiterSharing\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.recruiterSharing.on").value(true)).andExpect(jsonPath("$.recruiterSharing.links").value(1));
        patchMeta(id, "{\"recruiterSharing\":true}").andExpect(jsonPath("$.recruiterSharing.links").value(1)); // no second link
        link(id, "{}");
        patchMeta(id, "{\"recruiterSharing\":false}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.recruiterSharing.on").value(false))
            .andExpect(jsonPath("$.recruiterSharing.links").value(0));
        mockMvc.perform(get("/api/profile/resumes/" + id + "/access")).andExpect(jsonPath("$.links.length()").value(0));
        patchMeta(id, "{\"recruiterSharing\":\"yes\"}").andExpect(status().isUnprocessableEntity());
    }

    @Test
    void visibilityPrivateRevokesPeopleAndLeavesTheOrg() throws Exception {
        Long id = createBuilt("Backend");
        grant(id, "{\"email\":\"admin@localhost\"}");
        mockMvc.perform(asAdmin(get("/api/profile/resumes/shared/" + id + "/doc"))).andExpect(status().isOk());
        patchMeta(id, "{\"visibility\":\"PRIVATE\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.visibility.mode").value("PRIVATE"))
            .andExpect(jsonPath("$.visibility.people").value(0))
            .andExpect(jsonPath("$.shareWithOrg").value(false));
        mockMvc.perform(asAdmin(get("/api/profile/resumes/shared/" + id + "/doc"))).andExpect(status().isNotFound());
        // only PRIVATE can be set that way; people and links have their own controls
        patchMeta(id, "{\"visibility\":\"PEOPLE\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("META_INVALID"));
    }

    @Test
    void recruiterSharingIsRefusedWhileShareLinksAreOff() throws Exception {
        Long id = createBuilt("Backend");
        setting(ResumeBuilderSettingKeys.FEATURE_SHARE_LINKS, "false");
        patchMeta(id, "{\"recruiterSharing\":true}").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FEATURE_DISABLED"));
        assertThat(accessFor(id)).isEmpty();
        // turning it OFF is always allowed
        patchMeta(id, "{\"recruiterSharing\":false}").andExpect(status().isOk());
    }

    // ---- the account lifecycle ------------------------------------------------------------------------

    @Test
    void erasingAGranteeRemovesTheirGrantsAndViews() throws Exception {
        Long id = createBuilt("Backend");
        grant(id, "{\"email\":\"admin@localhost\"}");
        mockMvc.perform(asAdmin(get("/api/profile/resumes/shared/" + id + "/doc"))).andExpect(status().isOk());
        assertThat(events(id)).hasSize(1);
        dataService.deleteSharingAsViewer("admin");
        assertThat(accessFor(id)).isEmpty();
        assertThat(events(id)).isEmpty();
    }

    @Test
    void theAccountExportListsSharesWithoutTheTokens() throws Exception {
        Long id = createBuilt("Backend");
        String token = tokenOf(link(id, "{\"label\":\"Acme\"}"));
        grant(id, "{\"email\":\"admin@localhost\"}");
        User me = userRepository.findOneByLogin("user").orElseThrow();
        var rows = dataService.exportResumeShares(me.getId());
        assertThat(rows).hasSize(2);
        assertThat(om.writeValueAsString(rows)).doesNotContain(token).contains("Acme").contains("admin");
    }

    @Test
    void deletingAResumeEndsEveryShareOfIt() throws Exception {
        Long id = createBuilt("Backend");
        String token = tokenOf(link(id, "{}"));
        grant(id, "{\"email\":\"admin@localhost\"}");
        publicGet("/api/public/resumes/" + token).andExpect(status().isOk());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/profile/resumes/" + id)).andExpect(status().isNoContent());
        em.flush();
        em.clear();
        publicGet("/api/public/resumes/" + token).andExpect(status().isNotFound());
        mockMvc.perform(asAdmin(get("/api/profile/resumes/shared/" + id + "/doc"))).andExpect(status().isNotFound());
    }
}
