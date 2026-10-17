package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.domain.enumeration.Provenance;
import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeDocVersionRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ProfileService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.resume.ResumeDocumentValidator;
import com.dossier.api.service.resume.TemplateThemeDefaults;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for {@link ResumeDocResource} (Resume Builder R0.3): create from the profile,
 * load with an ETag, save under If-Match, the refusals (428/409/413/422), the template switch,
 * ownership (404 for every verb), the {@code parsed_json}/label projection, ProfileVersion
 * behaviour and the Free resume cap.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class ResumeDocResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private BioRepository bioRepository;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private ResumeDocRepository resumeDocRepository;

    @Autowired
    private ResumeDocVersionRepository resumeDocVersionRepository;

    @Autowired
    private ProfileItemRepository profileItemRepository;

    @Autowired
    private jakarta.persistence.EntityManager em;

    @Autowired
    private AppSettingRepository appSettingRepository;

    @Autowired
    private ResumeBuilderSettings settings;

    /** No shipped template declares theme defaults yet; the R3.4 tests stub them. Unstubbed it answers null (= none). */
    @MockitoBean
    private TemplateThemeDefaults templateDefaults;

    @AfterEach
    void dropSettingsCache() {
        settings.invalidate(); // the setting rows roll back with the test transaction; the cache must not outlive them
    }

    // ---- helpers ------------------------------------------------------------

    private User user() {
        return userRepository.findOneByLogin("user").orElseThrow();
    }

    /** Writes a setting (rolled back with the test transaction) and drops the settings cache. */
    private void setting(String key, String value) {
        appSettingRepository.saveAndFlush(new AppSetting(key, value, "it", Instant.now()));
        settings.invalidate();
    }

    /** {@code resume.templates.enabled} defaults to Modern only; the tests that switch to the other known ids enable them first. */
    private void enableTemplates(String... ids) {
        setting("resume.templates.enabled", om.valueToTree(ids).toString());
    }

    private JsonNode json(String body) throws Exception {
        return om.readTree(body);
    }

    private JsonNode createBuilt(String body) throws Exception {
        String res = mockMvc
            .perform(post("/api/profile/resumes/built").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return json(res);
    }

    private String version() throws Exception {
        String res = mockMvc.perform(get("/api/profile/version")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json(res).get("version").asText();
    }

    /** A small valid document with the given title and summary text. */
    private ObjectNode doc(String title, String summary) throws Exception {
        return (ObjectNode) json(
            "{\"schema\":1,\"meta\":{\"title\":\"" + title + "\"},\"basics\":{\"name\":\"Ada Lovelace\"},\"sections\":[" +
            "{\"id\":\"s_sum0001\",\"kind\":\"SUMMARY\",\"title\":\"Summary\",\"hidden\":false," +
            "\"items\":[{\"id\":\"i_sum0001\",\"text\":\"" + summary + "\"}]}]}"
        );
    }

    private String putBody(JsonNode doc) throws Exception {
        return om.writeValueAsString(Map.of("doc", doc));
    }

    private org.springframework.test.web.servlet.ResultActions putDoc(Long id, String ifMatch, String body) throws Exception {
        var req = put("/api/profile/resumes/" + id + "/doc").contentType(MediaType.APPLICATION_JSON).content(body);
        if (ifMatch != null) req = req.header(HttpHeaders.IF_MATCH, ifMatch);
        return mockMvc.perform(req);
    }

    private ProfileItem profileItem(ProfileSection section, int position, String dataJson, boolean hidden) {
        ProfileItem p = new ProfileItem();
        p.setUser(user());
        p.setSection(section);
        p.setPosition(position);
        p.setDataJson(dataJson);
        p.setProvenance(Provenance.PARSED);
        p.setHidden(hidden);
        return profileItemRepository.saveAndFlush(p);
    }

    /** Another user's built resume with a document, written straight through the repositories. */
    private Long otherUsersBuiltResume() throws Exception {
        User other = userRepository.findOneByLogin("admin").orElseThrow();
        Resume r = new Resume().label("Theirs").r2ObjectKey("").status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        r.setKind(ResumeKind.BUILT);
        r.setUser(other);
        r = resumeRepository.saveAndFlush(r);
        ResumeDoc d = new ResumeDoc();
        d.setResume(r);
        d.setUser(other);
        d.setDocJson(om.writeValueAsString(doc("Theirs", "secret")));
        d.setThemeJson("{}");
        d.setContentHash("0".repeat(64));
        resumeDocRepository.saveAndFlush(d);
        return r.getId();
    }

    // ---- create -------------------------------------------------------------

    @Test
    void createBuiltFromTheBioAloneWhenThereAreNoProfileItems() throws Exception {
        Bio bio = new Bio().payload("{\"firstName\":\"Ada\",\"lastName\":\"Lovelace\",\"email\":\"ada@example.com\",\"city\":\"London\",\"state\":\"UK\",\"linkedin\":\"linkedin.com/in/ada\"}");
        bio.setUpdatedAt(Instant.now());
        bio.setUser(user());
        bioRepository.saveAndFlush(bio);

        enableTemplates("modern", "classic");
        String res = mockMvc
            .perform(
                post("/api/profile/resumes/built")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"templateId\":\"classic\",\"target\":\"Backend SWE\",\"label\":\"Backend resume\"}")
            )
            .andExpect(status().isCreated())
            .andExpect(header().string(HttpHeaders.ETAG, "\"1\""))
            .andExpect(jsonPath("$.resume.kind").value("BUILT"))
            .andExpect(jsonPath("$.resume.templateId").value("classic"))
            .andExpect(jsonPath("$.resume.label").value("Backend resume"))
            .andExpect(jsonPath("$.doc.kind").value("BUILT"))
            .andExpect(jsonPath("$.doc.templateId").value("classic"))
            .andExpect(jsonPath("$.doc.docVersion").value(1))
            .andExpect(jsonPath("$.doc.doc.schema").value(2))
            .andExpect(jsonPath("$.doc.schemaVersion").value(2))
            .andExpect(jsonPath("$.doc.doc.meta.title").value("Backend resume"))
            .andExpect(jsonPath("$.doc.doc.meta.target").value("Backend SWE"))
            .andExpect(jsonPath("$.doc.doc.basics.name").value("Ada Lovelace"))
            .andExpect(jsonPath("$.doc.doc.basics.email").value("ada@example.com"))
            .andExpect(jsonPath("$.doc.doc.basics.location").value("London, UK"))
            .andExpect(jsonPath("$.doc.doc.basics.links[0].label").value("LinkedIn"))
            .andExpect(jsonPath("$.doc.doc.sections.length()").value(0))
            .andExpect(jsonPath("$.doc.contentHash").value(org.hamcrest.Matchers.matchesPattern("[0-9a-f]{64}")))
            .andReturn()
            .getResponse()
            .getContentAsString();

        Long id = json(res).at("/resume/id").asLong();
        Resume stored = resumeRepository.findById(id).orElseThrow();
        assertThat(stored.getKind()).isEqualTo(ResumeKind.BUILT);
        assertThat(stored.getParsedJson()).isNotBlank().contains("\"experience\":[]");
        // the document passes the same validator a save does
        assertThat(ResumeDocumentValidator.validate(json(res).at("/doc/doc"))).isEmpty();
    }

    @Test
    void createBuiltFromProfileItemsSkipsHiddenOnesAndLinksTheSource() throws Exception {
        ProfileItem job = profileItem(
            ProfileSection.EXPERIENCE,
            0,
            "{\"title\":\"Software Engineer\",\"company\":\"Google\",\"start\":\"2022-06\",\"end\":\"not a date\",\"current\":true,\"bullets\":[\"Led a migration\",{\"text\":\"Cut latency 40%\",\"src\":\"user\"}]}",
            false
        );
        profileItem(ProfileSection.EXPERIENCE, 1, "{\"title\":\"Secret job\",\"org\":\"Hidden Inc\"}", true);
        profileItem(ProfileSection.SKILL, 0, "{\"group\":\"Languages\",\"skills\":[{\"name\":\"Java\",\"level\":\"expert\"},\"Go\"]}", false);
        profileItem(ProfileSection.LINK, 0, "{\"label\":\"Blog\",\"url\":\"https://ada.dev\"}", false);
        profileItem(ProfileSection.VOLUNTEER, 0, "{\"title\":\"Mentor\",\"org\":\"Code Club\"}", false);

        JsonNode created = createBuilt("{}");
        JsonNode doc = created.at("/doc/doc");

        assertThat(created.at("/doc/templateId").asText()).isEqualTo("modern");
        assertThat(created.at("/resume/label").asText()).isEqualTo("My resume");
        assertThat(doc.at("/sections/0/kind").asText()).isEqualTo("EXPERIENCE");
        assertThat(doc.at("/sections/1/kind").asText()).isEqualTo("SKILLS");
        assertThat(doc.at("/sections/2/kind").asText()).isEqualTo("CUSTOM");
        assertThat(doc.at("/sections/2/title").asText()).isEqualTo("Volunteering");
        assertThat(doc.at("/sections").size()).isEqualTo(3);
        JsonNode exp = doc.at("/sections/0/items");
        assertThat(exp.size()).as("hidden profile item excluded").isEqualTo(1);
        assertThat(exp.get(0).get("profileItemId").asLong()).isEqualTo(job.getId());
        assertThat(exp.get(0).get("org").asText()).isEqualTo("Google");
        assertThat(exp.get(0).get("current").asBoolean()).isTrue();
        assertThat(exp.get(0).has("end")).as("invalid date dropped").isFalse();
        assertThat(exp.get(0).at("/bullets/0/src").asText()).isEqualTo("parsed");
        assertThat(exp.get(0).at("/bullets/1/src").asText()).isEqualTo("user");
        assertThat(doc.at("/sections/1/items/0/skills").toString()).isEqualTo("[\"Java\",\"Go\"]");
        assertThat(doc.at("/basics/links/0/url").asText()).isEqualTo("https://ada.dev");
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();

        // the projection reached the mirror
        Resume stored = resumeRepository.findById(created.at("/resume/id").asLong()).orElseThrow();
        assertThat(stored.getParsedJson()).contains("Google").contains("Java");
    }

    @Test
    void createBuiltRejectsAnUnknownTemplateBeforeCreatingAnything() throws Exception {
        long before = resumeRepository.count();
        mockMvc
            .perform(post("/api/profile/resumes/built").contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":\"comic-sans\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("DOC_INVALID"))
            .andExpect(jsonPath("$.path").value("$.templateId"));
        assertThat(resumeRepository.count()).isEqualTo(before);
    }

    @Test
    void freeCapAppliesToBuiltResumesAndCountsUploadedOnes() throws Exception {
        createBuilt("{\"label\":\"One\"}");
        createBuilt("{\"label\":\"Two\"}");
        mockMvc
            .perform(
                post("/api/profile/resumes")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"label\":\"Uploaded\",\"status\":\"NEEDS_REVIEW\",\"kind\":\"BUILT\"}")
            )
            .andExpect(status().isCreated())
            // a client cannot mint a BUILT resume without a document through the old endpoint
            .andExpect(jsonPath("$.kind").value("UPLOADED"));

        long before = resumeRepository.count();
        mockMvc
            .perform(post("/api/profile/resumes/built").contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"Four\"}"))
            .andExpect(status().isPaymentRequired())
            .andExpect(jsonPath("$.code").value("RESUME_LIMIT"))
            .andExpect(jsonPath("$.limit").value(ProfileService.FREE_RESUME_LIMIT))
            .andExpect(jsonPath("$.plan").value("FREE"));
        assertThat(resumeRepository.count()).as("nothing created on 402").isEqualTo(before);
    }

    @Test
    void listedResumesCarryKindAndTheTemplateOfBuiltOnes() throws Exception {
        enableTemplates("modern", "compact");
        createBuilt("{\"templateId\":\"compact\",\"label\":\"Built\"}");
        mockMvc
            .perform(get("/api/profile/resumes"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.label == 'Built')].kind").value("BUILT"))
            .andExpect(jsonPath("$[?(@.label == 'Built')].templateId").value("compact"));
    }

    // ---- read ---------------------------------------------------------------

    @Test
    void getDocReturnsTheDocumentWithItsVersionAsETag() throws Exception {
        Long id = createBuilt("{\"label\":\"Mine\"}").at("/resume/id").asLong();
        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/doc"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ETAG, "\"1\""))
            .andExpect(jsonPath("$.resumeId").value(id))
            .andExpect(jsonPath("$.label").value("Mine"))
            .andExpect(jsonPath("$.doc.meta.title").value("Mine"))
            .andExpect(jsonPath("$.theme").isMap())
            .andExpect(jsonPath("$.profileSyncedAt").isNotEmpty());
    }

    @Test
    void getDocOfAnUploadedResumeIs404() throws Exception {
        String created = mockMvc
            .perform(post("/api/profile/resumes").contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"Pdf\",\"status\":\"NEEDS_REVIEW\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        mockMvc.perform(get("/api/profile/resumes/" + json(created).get("id").asLong() + "/doc")).andExpect(status().isNotFound());
    }

    @Test
    void getTextRendersThePlainTextOfTheDocument() throws Exception {
        Long id = createBuilt("{\"label\":\"Mine\"}").at("/resume/id").asLong();
        putDoc(id, "\"1\"", putBody(doc("Mine", "Builds reliable systems"))).andExpect(status().isOk());
        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/doc/text"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("Ada Lovelace")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("Builds reliable systems")));
    }

    // ---- save ---------------------------------------------------------------

    @Test
    void putWritesDocProjectionAndBumpsTheVersionButNeverRenames() throws Exception {
        JsonNode created = createBuilt("{\"label\":\"Draft\"}");
        Long id = created.at("/resume/id").asLong();
        String firstHash = created.at("/doc/contentHash").asText();

        String res = putDoc(id, "\"1\"", putBody(doc("Backend SWE - 2026", "Builds reliable systems")))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ETAG, "\"2\""))
            .andExpect(jsonPath("$.docVersion").value(2))
            // R3.9: the resume's name is the truth - the title the client sent is overwritten, not applied or rejected
            .andExpect(jsonPath("$.label").value("Draft"))
            .andExpect(jsonPath("$.doc.meta.title").value("Draft"))
            .andExpect(jsonPath("$.doc.sections[0].items[0].text").value("Builds reliable systems"))
            .andReturn()
            .getResponse()
            .getContentAsString();
        assertThat(json(res).get("contentHash").asText()).isNotEqualTo(firstHash).matches("[0-9a-f]{64}");

        Resume resume = resumeRepository.findById(id).orElseThrow();
        assertThat(resume.getLabel()).isEqualTo("Draft");
        assertThat(resume.getUpdatedByLogin()).isEqualTo("user");
        assertThat(json(resume.getParsedJson()).get("summary").asText()).isEqualTo("Builds reliable systems");
        assertThat(resume.getUpdatedAt()).isNotNull();

        // chained saves: the new ETag is accepted, the old one is not
        putDoc(id, "\"2\"", putBody(doc("Backend SWE - 2026", "Edited again"))).andExpect(status().isOk()).andExpect(header().string(HttpHeaders.ETAG, "\"3\""));
        putDoc(id, "\"2\"", putBody(doc("Backend SWE - 2026", "Stale"))).andExpect(status().isConflict());
    }

    @Test
    void putMirrorsTheResumesTargetIntoTheDocumentToo() throws Exception {
        Long id = createBuilt("{\"label\":\"Mine\",\"target\":\"Backend SWE\"}").at("/resume/id").asLong();
        assertThat(resumeRepository.findById(id).orElseThrow().getTarget()).isEqualTo("Backend SWE");
        ObjectNode sent = doc("Mine", "s");
        ((ObjectNode) sent.get("meta")).put("target", "Something else");
        putDoc(id, "\"1\"", putBody(sent))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.doc.meta.target").value("Backend SWE"));
    }

    @Test
    void putStoresATheme() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        ObjectNode body = om.createObjectNode();
        body.set("doc", doc("T", "s"));
        body.set("theme", json("{\"accent\":\"#112233\",\"fontScale\":1}"));
        putDoc(id, "\"1\"", om.writeValueAsString(body)).andExpect(status().isOk()).andExpect(jsonPath("$.theme.accent").value("#112233"));
        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(jsonPath("$.theme.accent").value("#112233"));

        body.set("theme", json("[1]"));
        putDoc(id, "\"2\"", om.writeValueAsString(body)).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("$.theme"));
    }

    @Test
    void putWithoutIfMatchIs428() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        putDoc(id, null, putBody(doc("T", "s")))
            .andExpect(status().isPreconditionRequired())
            .andExpect(jsonPath("$.code").value("IF_MATCH_REQUIRED"));
    }

    @Test
    void putWithAStaleVersionIs409CarryingTheServersDocument() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        putDoc(id, "\"1\"", putBody(doc("T", "server side text"))).andExpect(status().isOk());

        putDoc(id, "\"1\"", putBody(doc("T", "my stale edit")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("DOC_VERSION_CONFLICT"))
            .andExpect(jsonPath("$.serverVersion").value(2))
            .andExpect(jsonPath("$.doc.sections[0].items[0].text").value("server side text"));
        // garbage in If-Match is just a version that does not match
        putDoc(id, "banana", putBody(doc("T", "x"))).andExpect(status().isConflict()).andExpect(jsonPath("$.serverVersion").value(2));
        // the stale write changed nothing
        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(jsonPath("$.doc.sections[0].items[0].text").value("server side text"));
    }

    @Test
    void putAnInvalidDocumentIs422WithThePathOfTheFirstProblem() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        ObjectNode bad = doc("T", "s");
        ((ObjectNode) bad.at("/sections/0")).put("kind", "WIZARDRY");

        putDoc(id, "\"1\"", putBody(bad))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("DOC_INVALID"))
            .andExpect(jsonPath("$.path").value("$.sections[0].kind"))
            .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("unknown section kind")));

        // no doc at all, and a body that is not an object
        putDoc(id, "\"1\"", "{}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("DOC_INVALID"));
        putDoc(id, "\"1\"", "[]").andExpect(status().isUnprocessableEntity());

        // nothing was written
        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(header().string(HttpHeaders.ETAG, "\"1\""));
    }

    @Test
    void putAnOversizedDocumentIs413() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        ObjectNode big = doc("T", "x".repeat(ResumeDocumentValidator.MAX_BYTES + 10));

        putDoc(id, "\"1\"", putBody(big)).andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.code").value("DOC_TOO_LARGE"));
    }

    // ---- schema v2 (R2.7) ---------------------------------------------------------

    private static final String V1_DOC =
        "{\"schema\":1,\"meta\":{\"title\":\"Old\"},\"basics\":{\"name\":\"Ada Lovelace\",\"photoKey\":\"resume-photos/1/old.jpg\"},\"sections\":["
        + "{\"id\":\"s_sum0001\",\"kind\":\"SUMMARY\",\"title\":\"Summary\",\"items\":[{\"id\":\"i_sum0001\",\"text\":\"Hello there\"}]}]}";

    /** A built resume of the current user whose stored document is exactly {@code docJson}, at schema_version {@code schemaVersion}. */
    private Long builtResumeWithStoredDoc(String docJson, int schemaVersion) {
        User me = user();
        Resume r = new Resume().label("Stored").r2ObjectKey("").status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        r.setKind(ResumeKind.BUILT);
        r.setUser(me);
        r = resumeRepository.saveAndFlush(r);
        ResumeDoc d = new ResumeDoc();
        d.setResume(r);
        d.setUser(me);
        d.setDocJson(docJson);
        d.setSchemaVersion(schemaVersion);
        d.setThemeJson("{}");
        d.setContentHash("0".repeat(64));
        resumeDocRepository.saveAndFlush(d);
        return r.getId();
    }

    private String etagOf(Long id) throws Exception {
        return mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(status().isOk()).andReturn().getResponse().getHeader(HttpHeaders.ETAG);
    }

    @Test
    void aV1RowReadsAsV2WithoutBeingRewritten() throws Exception {
        Long id = builtResumeWithStoredDoc(V1_DOC, 1);
        em.flush();
        em.clear();

        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/doc"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.doc.schema").value(2))
            .andExpect(jsonPath("$.schemaVersion").value(2))
            .andExpect(jsonPath("$.doc.basics.photo.key").value("resume-photos/1/old.jpg"))
            .andExpect(jsonPath("$.doc.basics.photoKey").doesNotExist())
            .andExpect(jsonPath("$.doc.sections[0].items[0].text").value("Hello there"));

        ResumeDoc stored = resumeDocRepository.findById(id).orElseThrow();
        // MySQL's JSON type re-spaces and re-orders keys, so compare the parsed documents
        assertThat(json(stored.getDocJson())).as("a read never writes").isEqualTo(json(V1_DOC));
        assertThat(stored.getSchemaVersion()).isEqualTo(1);
    }

    @Test
    void aV1ConflictBodyIsUpgradedToo() throws Exception {
        Long id = builtResumeWithStoredDoc(V1_DOC, 1);
        putDoc(id, "\"99\"", putBody(doc("Mine", "x")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.doc.schema").value(2))
            .andExpect(jsonPath("$.doc.basics.photo.key").value("resume-photos/1/old.jpg"));
    }

    @Test
    void putAcceptsV1AndStoresV2() throws Exception {
        Long id = builtResumeWithStoredDoc(V1_DOC, 1);
        em.flush();
        em.clear();
        String etag = etagOf(id);

        // doc() builds a schema 1 document: the save upgrades it, validates it as v2 and stores v2
        putDoc(id, etag, putBody(doc("Upgraded", "Fresh text")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.doc.schema").value(2))
            .andExpect(jsonPath("$.schemaVersion").value(2));

        ResumeDoc stored = resumeDocRepository.findById(id).orElseThrow();
        assertThat(stored.getSchemaVersion()).isEqualTo(2);
        assertThat(stored.getDocJson()).contains("\"schema\":2").doesNotContain("\"schema\":1");
        assertThat(stored.getPhotoKey()).isNull();
    }

    @Test
    void putStoresMarksListsAndInterestsAndMirrorsThePhotoKey() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        String photoKey = "resume-photos/" + user().getId() + "/" + id + "-abc-photo.jpg";
        ObjectNode v2 = (ObjectNode) json(
            "{\"schema\":2,\"meta\":{\"title\":\"V2\"},\"basics\":{\"name\":\"Ada\",\"photo\":{\"key\":\"" + photoKey + "\"}},\"sections\":["
                + "{\"id\":\"s_sum0001\",\"kind\":\"SUMMARY\",\"items\":[{\"id\":\"i_sum0001\",\"text\":\"Bold start\\nsecond line\",\"list\":\"bullet\",\"marks\":[{\"s\":0,\"e\":4,\"t\":\"b\"}]}]},"
                + "{\"id\":\"s_int00001\",\"kind\":\"INTERESTS\",\"items\":[{\"id\":\"i_int00001\",\"text\":\"Chess\"}]}]}"
        );
        putDoc(id, "\"1\"", putBody(v2))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.doc.sections[0].items[0].marks[0].t").value("b"))
            .andExpect(jsonPath("$.doc.basics.photo.key").value(photoKey));

        ResumeDoc stored = resumeDocRepository.findById(id).orElseThrow();
        assertThat(stored.getPhotoKey()).isEqualTo(photoKey);
        // the mirror: summary list lines, nothing from INTERESTS
        assertThat(stored.getResume().getParsedJson()).contains("\"summary\":\"Bold start\\nsecond line\"").doesNotContain("Chess");
        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/doc/text"))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("- Bold start\n- second line")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("INTERESTS\nChess")));
    }

    // ---- Resume Score (R2.5): computed by the BFF, stored without evaluating -------------

    private static final String SCORE =
        "{\"rulesetVersion\":\"v1\",\"score\":82,\"groups\":[{\"id\":\"G1\",\"pass\":true,\"fraction\":1},{\"id\":\"G2\",\"pass\":true,\"fraction\":0.8261},"
            + "{\"id\":\"G3\",\"pass\":false,\"fraction\":0.5},{\"id\":\"G4\",\"pass\":true,\"fraction\":0.9375},{\"id\":\"G5\",\"pass\":true,\"fraction\":0.75}]}";

    private String putBodyWithScore(JsonNode doc, String score) throws Exception {
        ObjectNode body = om.createObjectNode();
        body.set("doc", doc);
        body.set("score", json(score));
        return om.writeValueAsString(body);
    }

    @Test
    void aSaveStoresTheScoreTheBffComputedAndEveryReadShowsIt() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        assertThat(resumeDocRepository.findById(id).orElseThrow().getScore()).isNull();

        putDoc(id, "\"1\"", putBodyWithScore(doc("Mine", "Scored"), SCORE))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.score.score").value(82))
            .andExpect(jsonPath("$.score.rulesetVersion").value("v1"));

        ResumeDoc stored = resumeDocRepository.findById(id).orElseThrow();
        assertThat(stored.getScore()).isEqualTo(82);
        JsonNode record = json(stored.getScoreJson());
        assertThat(record.path("rulesetVersion").asText()).isEqualTo("v1");
        assertThat(record.path("groups")).hasSize(5);
        assertThat(record.path("computedAt").asText()).isNotBlank(); // the server stamps it
        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(jsonPath("$.score.score").value(82));

        // the list badge: ResumeDTO.score, only for the built resume that has one
        String list = mockMvc.perform(get("/api/profile/resumes")).andReturn().getResponse().getContentAsString();
        JsonNode row = null;
        for (JsonNode n : json(list)) if (n.path("id").asLong() == id) row = n;
        assertThat(row).isNotNull();
        assertThat(row.path("score").asInt()).isEqualTo(82);
    }

    @Test
    void aSaveWithoutAScoreKeepsTheStoredOneAndANewScoreReplacesIt() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        putDoc(id, "\"1\"", putBodyWithScore(doc("Mine", "One"), SCORE)).andExpect(status().isOk());
        putDoc(id, "\"2\"", putBody(doc("Mine", "Two"))).andExpect(status().isOk()).andExpect(jsonPath("$.score.score").value(82));
        putDoc(id, "\"3\"", putBodyWithScore(doc("Mine", "Three"), SCORE.replace("\"score\":82", "\"score\":40")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.score.score").value(40));
        assertThat(resumeDocRepository.findById(id).orElseThrow().getScore()).isEqualTo(40);
    }

    @Test
    void aScoreOfAnUnknownRulesetIsIgnoredNotAnError() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        putDoc(id, "\"1\"", putBodyWithScore(doc("Mine", "Scored"), SCORE.replace("\"v1\"", "\"v99\"")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.score").doesNotExist());
        assertThat(resumeDocRepository.findById(id).orElseThrow().getScore()).isNull();
    }

    @Test
    void anOversizedOrMalformedScoreIs422AndTheSaveDoesNotHappen() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        String big = SCORE.replace("}]}", "}],\"pad\":\"" + "x".repeat(5000) + "\"}");
        putDoc(id, "\"1\"", putBodyWithScore(doc("Mine", "Big"), big))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("DOC_INVALID"))
            .andExpect(jsonPath("$.path").value("$.score"));
        for (String bad : new String[] {
            "{\"rulesetVersion\":\"v1\",\"score\":101,\"groups\":[]}",
            "{\"rulesetVersion\":\"v1\",\"score\":\"high\",\"groups\":[]}",
            "{\"rulesetVersion\":\"v1\",\"score\":50}",
            "{\"rulesetVersion\":\"v1\",\"score\":50,\"groups\":[{\"id\":\"G1\",\"pass\":true,\"fraction\":2}]}",
            "[1,2]",
        }) {
            putDoc(id, "\"1\"", putBodyWithScore(doc("Mine", "Bad"), bad)).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("DOC_INVALID"));
        }
        ResumeDoc stored = resumeDocRepository.findById(id).orElseThrow();
        assertThat(stored.getDocVersion()).isEqualTo(1);
        assertThat(stored.getScore()).isNull();
    }

    @Test
    void aScoreChangeAloneDoesNotMoveTheProfileVersion() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        putDoc(id, "\"1\"", putBodyWithScore(doc("Mine", "Same text"), SCORE)).andExpect(status().isOk());
        String before = version();
        // identical content, a different score: the extension's mirror (what ProfileVersion hashes) did not change
        putDoc(id, "\"2\"", putBodyWithScore(doc("Mine", "Same text"), SCORE.replace("\"score\":82", "\"score\":70"))).andExpect(status().isOk());
        assertThat(version()).isEqualTo(before);
    }

    @Test
    void aPhotoUnderSomeoneElsesPrefixIs422() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        ObjectNode v2 = (ObjectNode) json(
            "{\"schema\":2,\"meta\":{\"title\":\"V2\"},\"basics\":{\"photo\":{\"key\":\"resume-photos/" + (user().getId() + 1) + "/x.jpg\"}},\"sections\":[]}"
        );
        putDoc(id, "\"1\"", putBody(v2))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("DOC_INVALID"))
            .andExpect(jsonPath("$.path").value("$.basics.photo.key"));
    }

    @Test
    void invalidMarksAre422WithTheirPath() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        ObjectNode bad = doc("T", "short");
        ((ObjectNode) bad.at("/sections/0/items/0")).set("marks", json("[{\"s\":0,\"e\":50,\"t\":\"b\"}]"));
        putDoc(id, "\"1\"", putBody(bad))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.path").value("$.sections[0].items[0].marks[0].e"));
    }

    @Test
    void aFormattingOnlySaveLeavesTheProfileVersionAlone() throws Exception {
        Long id = createBuilt("{\"label\":\"Mine\"}").at("/resume/id").asLong();
        putDoc(id, "\"1\"", putBody(doc("Mine", "Some summary text"))).andExpect(status().isOk());
        String before = version();

        ObjectNode marked = doc("Mine", "Some summary text");
        ((ObjectNode) marked.at("/sections/0/items/0")).set("marks", json("[{\"s\":0,\"e\":4,\"t\":\"b\"},{\"s\":5,\"e\":12,\"t\":\"i\"}]"));
        putDoc(id, "\"2\"", putBody(marked)).andExpect(status().isOk());
        assertThat(version()).as("marks are not in parsed_json").isEqualTo(before);
    }

    @Test
    void tailoredFromCanBeEchoedButNotIntroducedChangedOrDropped() throws Exception {
        String tailored =
            "{\"resumeId\":9,\"job\":{\"source\":\"pasted\",\"title\":\"PM\",\"company\":\"Stripe\",\"jdHash\":\"" + "a".repeat(64) + "\"}}";
        Long id = createBuilt("{}").at("/resume/id").asLong();

        // introducing it: refused
        ObjectNode withTf = doc("T", "s");
        ((ObjectNode) withTf.get("meta")).set("tailoredFrom", json(tailored));
        putDoc(id, "\"1\"", putBody(withTf))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.path").value("$.meta.tailoredFrom"));

        // the server writes it (a later story does; here, straight into the row)
        ResumeDoc d = resumeDocRepository.findById(id).orElseThrow();
        ObjectNode stored = (ObjectNode) json(d.getDocJson());
        ((ObjectNode) stored.get("meta")).set("tailoredFrom", json(tailored));
        d.setDocJson(om.writeValueAsString(stored));
        resumeDocRepository.saveAndFlush(d);
        em.flush();
        em.clear();
        String etag = etagOf(id);

        // echoing it unchanged: fine
        ObjectNode echo = doc("T", "s");
        ((ObjectNode) echo.get("meta")).set("tailoredFrom", json(tailored));
        putDoc(id, etag, putBody(echo)).andExpect(status().isOk());
        etag = etagOf(id);

        // changing it, or dropping it: refused
        ObjectNode changed = doc("T", "s");
        ((ObjectNode) changed.get("meta")).set("tailoredFrom", json(tailored.replace("\"resumeId\":9", "\"resumeId\":10")));
        putDoc(id, etag, putBody(changed)).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("$.meta.tailoredFrom"));
        putDoc(id, etag, putBody(doc("T", "s"))).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("$.meta.tailoredFrom"));
    }

    // ---- template and ProfileVersion ------------------------------------------

    @Test
    void templatePatchSwitchesTheTemplateAndRejectsUnknownOnes() throws Exception {
        enableTemplates("modern", "classic");
        Long id = createBuilt("{}").at("/resume/id").asLong();

        mockMvc
            .perform(patch("/api/profile/resumes/" + id + "/doc/template").contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":\"classic\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.templateId").value("classic"))
            .andExpect(jsonPath("$.docVersion").value(2))
            .andExpect(header().string(HttpHeaders.ETAG, "\"2\""));

        mockMvc
            .perform(patch("/api/profile/resumes/" + id + "/doc/template").contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":\"nope\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("DOC_INVALID"));
        mockMvc
            .perform(patch("/api/profile/resumes/" + id + "/doc/template").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnprocessableEntity());
        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(jsonPath("$.templateId").value("classic"));
    }

    // ---- template switch safety net (R3.4) --------------------------------------

    private void setThemeJson(Long id, String themeJson) throws Exception {
        mockMvc
            .perform(patch("/api/profile/resumes/" + id + "/doc/theme").contentType(MediaType.APPLICATION_JSON).content("{\"theme\":" + themeJson + "}"))
            .andExpect(status().isOk());
    }

    private JsonNode patchTemplate(Long id, String body) throws Exception {
        String res = mockMvc
            .perform(patch("/api/profile/resumes/" + id + "/doc/template").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return json(res);
    }

    @Test
    void aSwitchAppliesTheTemplateDefaultsToUntouchedThemeKeysOnly() throws Exception {
        enableTemplates("modern", "classic");
        ObjectNode defaults = om.createObjectNode().put("accent", "#7c3aed").put("fontPair", "source-serif").put("spacing", "compact");
        when(templateDefaults.defaultsFor("classic")).thenReturn(defaults);
        Long id = createBuilt("{}").at("/resume/id").asLong();
        setThemeJson(id, "{\"accent\":\"#2563eb\",\"fontPair\":\"inter\",\"spacing\":\"normal\",\"_touched\":[\"accent\"]}");

        JsonNode switched = patchTemplate(id, "{\"templateId\":\"classic\"}");

        assertThat(switched.at("/templateId").asText()).isEqualTo("classic");
        assertThat(switched.at("/theme/accent").asText()).as("touched key kept").isEqualTo("#2563eb");
        assertThat(switched.at("/theme/fontPair").asText()).as("untouched key defaulted").isEqualTo("source-serif");
        assertThat(switched.at("/theme/spacing").asText()).isEqualTo("compact");
        assertThat(switched.at("/theme/_touched").get(0).asText()).isEqualTo("accent");
        // and it is stored, not just returned
        ResumeDoc stored = resumeDocRepository.findById(id).orElseThrow();
        assertThat(om.readTree(stored.getThemeJson()).at("/fontPair").asText()).isEqualTo("source-serif");
    }

    @Test
    void aSwitchWritesATemplateSwitchVersionRowWithTheNewThemeAndQueuesThePdfAtOnce() throws Exception {
        enableTemplates("modern", "classic");
        when(templateDefaults.defaultsFor("classic")).thenReturn(om.createObjectNode().put("fontPair", "georgia-arial"));
        Long id = createBuilt("{}").at("/resume/id").asLong();
        long rowsBefore = resumeDocVersionRepository.count();

        patchTemplate(id, "{\"templateId\":\"classic\"}");

        var latest = resumeDocVersionRepository.findFirstByResumeIdAndUserIdOrderByVersionNoDesc(id, user().getId()).orElseThrow();
        assertThat(resumeDocVersionRepository.count()).isEqualTo(rowsBefore + 1);
        assertThat(latest.getReason()).isEqualTo("TEMPLATE_SWITCH");
        assertThat(latest.getTemplateId()).isEqualTo("classic");
        assertThat(latest.getThemeJson()).contains("georgia-arial");
        ResumeDoc d = resumeDocRepository.findById(id).orElseThrow();
        assertThat(d.getPdfStatus()).isEqualTo("PENDING");
        assertThat(d.getPdfNextAttemptAt()).as("a switch is a checkpoint: no settle delay").isBeforeOrEqualTo(Instant.now());
    }

    @Test
    void anExplicitThemeRestoresTemplateAndThemeVerbatimWithoutApplyingDefaults() throws Exception {
        enableTemplates("modern", "classic");
        when(templateDefaults.defaultsFor("modern")).thenReturn(om.createObjectNode().put("accent", "#16a34a"));
        Long id = createBuilt("{}").at("/resume/id").asLong();
        setThemeJson(id, "{\"accent\":\"#ec4899\"}");
        patchTemplate(id, "{\"templateId\":\"classic\"}");

        // undo: back to modern with the theme the user had before, not modern's defaults
        JsonNode back = patchTemplate(id, "{\"templateId\":\"modern\",\"theme\":{\"accent\":\"#ec4899\"}}");

        assertThat(back.at("/templateId").asText()).isEqualTo("modern");
        assertThat(back.at("/theme/accent").asText()).isEqualTo("#ec4899");
    }

    @Test
    void aSwitchWithNoDefaultsLeavesTheThemeAndAnInvalidExplicitThemeIsRefused() throws Exception {
        enableTemplates("modern", "classic");
        Long id = createBuilt("{}").at("/resume/id").asLong();
        setThemeJson(id, "{\"accent\":\"#2563eb\"}");

        assertThat(patchTemplate(id, "{\"templateId\":\"classic\"}").at("/theme/accent").asText()).isEqualTo("#2563eb");

        mockMvc
            .perform(patch("/api/profile/resumes/" + id + "/doc/template").contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":\"modern\",\"theme\":{\"accent\":\"red\"}}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("THEME_INVALID"));
        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(jsonPath("$.templateId").value("classic"));
    }

    // ---- theme (Customize Template, R2.4) ----------------------------------------

    private org.springframework.test.web.servlet.ResultActions patchTheme(Long id, String body) throws Exception {
        return mockMvc.perform(patch("/api/profile/resumes/" + id + "/doc/theme").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void themePatchStoresTheBoundedThemeBumpsTheEtagAndWritesNoVersionRowOrProfileVersion() throws Exception {
        Long id = createBuilt("{\"label\":\"Mine\"}").at("/resume/id").asLong();
        String profileVersion = version();
        long versionRows = resumeDocVersionRepository.count();
        String before = etagOf(id);

        patchTheme(id, "{\"theme\":{\"accent\":\"#16a34a\",\"fontPair\":\"georgia-arial\",\"spacing\":\"spacious\",\"size\":99,\"density\":9,\"fit\":{\"mode\":\"auto\",\"target\":2,\"step\":0},\"_touched\":[\"accent\"],\"evil\":1}}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.theme.accent").value("#16a34a"))
            .andExpect(jsonPath("$.theme.fontPair").value("georgia-arial"))
            .andExpect(jsonPath("$.theme.spacing").value("spacious"))
            .andExpect(jsonPath("$.theme.fit.target").value(2))
            .andExpect(jsonPath("$.theme.size").doesNotExist())
            .andExpect(jsonPath("$.theme.evil").doesNotExist())
            .andExpect(jsonPath("$.docVersion").value(2))
            .andExpect(header().string(HttpHeaders.ETAG, "\"2\""));

        assertThat(before).isEqualTo("\"1\"");
        assertThat(resumeDocVersionRepository.count()).as("no version row").isEqualTo(versionRows);
        assertThat(version()).as("ProfileVersion unchanged").isEqualTo(profileVersion);
        // the next content save must use the new ETag; the old one is stale, and the theme survives a save that omits it
        putDoc(id, before, putBody(doc("Mine", "x"))).andExpect(status().isConflict());
        putDoc(id, "\"2\"", putBody(doc("Mine", "x"))).andExpect(status().isOk()).andExpect(jsonPath("$.theme.accent").value("#16a34a"));
    }

    @Test
    void themePatchRefusesOutOfBoundsValuesAndLeavesTheStoredThemeAlone() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        patchTheme(id, "{\"theme\":{\"accent\":\"#2563eb\"}}").andExpect(status().isOk());

        patchTheme(id, "{\"theme\":{\"accent\":\"javascript:alert(1)\"}}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("THEME_INVALID"))
            .andExpect(jsonPath("$.path").value("$.theme.accent"));
        patchTheme(id, "{\"theme\":{\"fit\":{\"target\":3}}}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("$.theme.fit.target"));
        patchTheme(id, "{\"theme\":{\"fontPair\":\"comic-sans\"}}").andExpect(status().isUnprocessableEntity());
        patchTheme(id, "{}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("THEME_INVALID"));
        patchTheme(id, "{\"theme\":\"x\"}").andExpect(status().isUnprocessableEntity());
        // over 8 KB
        patchTheme(id, "{\"theme\":{\"pad\":\"" + "x".repeat(9000) + "\"}}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("$.theme"));

        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(jsonPath("$.theme.accent").value("#2563eb")).andExpect(jsonPath("$.docVersion").value(2));
    }

    @Test
    void aKnownButDisabledTemplateIsRejectedOnSwitchAndOnCreate() throws Exception {
        // Only Modern is enabled (pinned here: the shipped default grows with every template), so "classic" exists but cannot be picked.
        enableTemplates("modern");
        Long id = createBuilt("{}").at("/resume/id").asLong();
        long before = resumeRepository.count();

        mockMvc
            .perform(patch("/api/profile/resumes/" + id + "/doc/template").contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":\"classic\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("DOC_INVALID"))
            .andExpect(jsonPath("$.path").value("$.templateId"))
            .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("not enabled")));
        mockMvc
            .perform(post("/api/profile/resumes/built").contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":\"classic\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.path").value("$.templateId"));
        assertThat(resumeRepository.count()).isEqualTo(before);
        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(jsonPath("$.templateId").value("modern"));

        // Enabling it by setting makes the same request succeed, and disabling Modern rejects Modern.
        enableTemplates("classic");
        mockMvc
            .perform(patch("/api/profile/resumes/" + id + "/doc/template").contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":\"classic\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.templateId").value("classic"));
        mockMvc
            .perform(patch("/api/profile/resumes/" + id + "/doc/template").contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":\"modern\"}"))
            .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void aNewResumeStartsWithTheConfiguredDefaultTemplateWhenItIsEnabled() throws Exception {
        enableTemplates("modern", "compact");
        setting("resume.templates.default", "compact");
        assertThat(createBuilt("{}").at("/doc/templateId").asText()).isEqualTo("compact");

        // a default that is not enabled falls back to the first enabled template
        enableTemplates("modern");
        assertThat(createBuilt("{}").at("/doc/templateId").asText()).isEqualTo("modern");
    }

    @Test
    void profileVersionMovesOnAContentSaveButNotOnATemplateSwitch() throws Exception {
        enableTemplates("modern", "compact");
        Long id = createBuilt("{\"label\":\"Mine\"}").at("/resume/id").asLong();
        String created = version();

        mockMvc
            .perform(patch("/api/profile/resumes/" + id + "/doc/template").contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":\"compact\"}"))
            .andExpect(status().isOk());
        assertThat(version()).as("template switch").isEqualTo(created);

        putDoc(id, "\"2\"", putBody(doc("Mine", "A new summary"))).andExpect(status().isOk());
        String afterContent = version();
        assertThat(afterContent).as("content save").isNotEqualTo(created);

        // a save that changes nothing the mirror shows (theme only) leaves it alone, too
        ObjectNode themeOnly = om.createObjectNode();
        themeOnly.set("doc", doc("Mine", "A new summary"));
        themeOnly.set("theme", json("{\"accent\":\"#abcdef\"}"));
        putDoc(id, "\"3\"", om.writeValueAsString(themeOnly)).andExpect(status().isOk());
        assertThat(version()).as("theme-only save").isEqualTo(afterContent);
    }

    // ---- ownership and lifecycle ----------------------------------------------

    @Test
    void anotherUsersResumeIs404ForEveryVerb() throws Exception {
        Long theirs = otherUsersBuiltResume();
        String base = "/api/profile/resumes/" + theirs;

        mockMvc.perform(get(base + "/doc")).andExpect(status().isNotFound());
        mockMvc.perform(get(base + "/doc/text")).andExpect(status().isNotFound());
        putDoc(theirs, "\"1\"", putBody(doc("Hacked", "x"))).andExpect(status().isNotFound());
        putDoc(theirs, null, putBody(doc("Hacked", "x"))).andExpect(status().isNotFound());
        mockMvc
            .perform(patch(base + "/doc/template").contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":\"classic\"}"))
            .andExpect(status().isNotFound());
        mockMvc
            .perform(patch(base + "/doc/theme").contentType(MediaType.APPLICATION_JSON).content("{\"theme\":{\"accent\":\"#ff0000\"}}"))
            .andExpect(status().isNotFound());

        ResumeDoc untouched = resumeDocRepository.findById(theirs).orElseThrow();
        assertThat(untouched.getTemplateId()).isEqualTo("modern");
        assertThat(untouched.getDocJson()).contains("secret");
        // a missing id looks the same
        mockMvc.perform(get("/api/profile/resumes/999999999/doc")).andExpect(status().isNotFound());
    }

    @Test
    void deletingABuiltResumeRemovesItsDocument() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        // A real DELETE runs in its own persistence context, where the document was never loaded.
        em.flush();
        em.clear();
        mockMvc.perform(delete("/api/profile/resumes/" + id)).andExpect(status().isNoContent());
        em.flush();
        em.clear();
        assertThat(((Number) em.createNativeQuery("select count(*) from resume where id = " + id).getSingleResult()).intValue()).isZero();
        assertThat(((Number) em.createNativeQuery("select count(*) from resume_doc where resume_id = " + id).getSingleResult()).intValue()).isZero();
        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(status().isNotFound());
    }

    @Test
    void ifMatchAcceptsWeakAndBareForms() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        putDoc(id, "W/\"1\"", putBody(doc("T", "weak"))).andExpect(status().isOk());
        putDoc(id, "2", putBody(doc("T", "bare"))).andExpect(status().isOk()).andExpect(jsonPath("$.docVersion").value(3));
    }

    // ---- export-recorded (R0.6) -------------------------------------------------

    @Test
    void exportRecordedSetsTheExportFieldsWithoutBumpingTheVersion() throws Exception {
        JsonNode created = createBuilt("{\"label\":\"Mine\"}");
        Long id = created.at("/resume/id").asLong();
        String hash = created.at("/doc/contentHash").asText();
        assertThat(created.at("/doc/exportedHash").isNull()).isTrue();

        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/export-recorded").contentType(MediaType.APPLICATION_JSON).content("{\"hash\":\"" + hash + "\"}"))
            .andExpect(status().isNoContent());

        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/doc"))
            .andExpect(jsonPath("$.exportedHash").value(hash))
            .andExpect(jsonPath("$.exportedAt").isNotEmpty())
            .andExpect(jsonPath("$.docVersion").value(1))
            .andExpect(header().string(HttpHeaders.ETAG, "\"1\""));

        // the list carries what "PDF out of date" needs: equal hashes now, different after an edit
        String list = mockMvc.perform(get("/api/profile/resumes")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode row = null;
        for (JsonNode n : json(list)) if (n.path("id").asLong() == id) row = n;
        assertThat(row).isNotNull();
        assertThat(row.path("exportedHash").asText()).isEqualTo(hash);
        assertThat(row.path("contentHash").asText()).isEqualTo(hash);

        putDoc(id, "\"1\"", putBody(doc("Mine", "Edited after export"))).andExpect(status().isOk());
        list = mockMvc.perform(get("/api/profile/resumes")).andReturn().getResponse().getContentAsString();
        for (JsonNode n : json(list)) if (n.path("id").asLong() == id) row = n;
        assertThat(row.path("exportedHash").asText()).isEqualTo(hash);
        assertThat(row.path("contentHash").asText()).isNotEqualTo(hash);
    }

    @Test
    void exportRecordedRejectsAMalformedHash() throws Exception {
        Long id = createBuilt("{}").at("/resume/id").asLong();
        for (String body : new String[] { "{}", "{\"hash\":\"abc\"}", "{\"hash\":\"" + "G".repeat(64) + "\"}" }) {
            mockMvc
                .perform(post("/api/profile/resumes/" + id + "/export-recorded").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("DOC_INVALID"));
        }
    }

    @Test
    void exportRecordedOnAnotherUsersResumeIs404AndWritesNothing() throws Exception {
        Long theirs = otherUsersBuiltResume();
        mockMvc
            .perform(post("/api/profile/resumes/" + theirs + "/export-recorded").contentType(MediaType.APPLICATION_JSON).content("{\"hash\":\"" + "a".repeat(64) + "\"}"))
            .andExpect(status().isNotFound());
        assertThat(resumeDocRepository.findById(theirs).orElseThrow().getExportedHash()).isNull();
        mockMvc
            .perform(post("/api/profile/resumes/999999999/export-recorded").contentType(MediaType.APPLICATION_JSON).content("{\"hash\":\"" + "a".repeat(64) + "\"}"))
            .andExpect(status().isNotFound());
    }
}
