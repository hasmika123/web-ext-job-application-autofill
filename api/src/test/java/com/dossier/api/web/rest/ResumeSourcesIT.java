package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.domain.enumeration.Provenance;
import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ProfileService;
import com.dossier.api.service.storage.FileStorage;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
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
 * The four "start a resume from..." sources and their companions (Resume Builder R2.6, DESIGN 8.8 / 9.10):
 * {@code POST /built} with {@code source} profile / scratch / upload / copy, {@code .../doc/duplicate},
 * {@code .../doc/import}, {@code .../original}. The cap is checked first, a copy is independent of its
 * source, a never-collected value in an upload is a 422 that names the item, and the uploaded original is
 * kept apart from the generated PDF.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class ResumeSourcesIT {

    private static final String STRUCTURED =
        "{\"summary\":\"Backend engineer.\",\"skills\":[\"Java\",\"SQL\"],\"experience\":[" +
        "{\"company\":\"Acme\",\"title\":\"Engineer\",\"location\":\"NYC\",\"startDate\":\"Jan 2020\",\"endDate\":\"Present\",\"current\":true,\"bullets\":[\"Built things\"]}," +
        "{\"company\":\"Globex\",\"title\":\"Intern\",\"location\":\"\",\"startDate\":\"2018\",\"endDate\":\"2019\",\"current\":false,\"bullets\":[\"Learned\"]}]," +
        "\"education\":[{\"school\":\"MIT\",\"degree\":\"BS\",\"field\":\"CS\",\"startDate\":\"2014\",\"endDate\":\"2018\",\"gpa\":\"\",\"location\":\"\"}],\"languages\":[],\"projects\":[]}";

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
    private ProfileItemRepository profileItemRepository;

    @Autowired
    private FileStorage storage;

    // ---- helpers ------------------------------------------------------------

    private User user() {
        return userRepository.findOneByLogin("user").orElseThrow();
    }

    private JsonNode json(String body) throws Exception {
        return om.readTree(body);
    }

    private void bio(String payload) {
        Bio bio = new Bio().payload(payload);
        bio.setUpdatedAt(Instant.now());
        bio.setUser(user());
        bioRepository.saveAndFlush(bio);
    }

    private org.springframework.test.web.servlet.ResultActions create(String body) throws Exception {
        return mockMvc.perform(post("/api/profile/resumes/built").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private JsonNode created(String body) throws Exception {
        return json(create(body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private static String uploadBody(String structured, String extra) {
        return "{\"source\":{\"kind\":\"upload\",\"fileName\":\"Ada CV.pdf\",\"structured\":" + structured + (extra == null ? "" : "," + extra) + "}}";
    }

    private ResumeDoc docOf(JsonNode builtResponse) {
        return resumeDocRepository.findById(builtResponse.at("/resume/id").asLong()).orElseThrow();
    }

    private void profileItem(ProfileSection section, String dataJson) {
        ProfileItem p = new ProfileItem();
        p.setUser(user());
        p.setSection(section);
        p.setPosition(0);
        p.setDataJson(dataJson);
        p.setProvenance(Provenance.USER);
        p.setHidden(false);
        profileItemRepository.saveAndFlush(p);
    }

    private static Set<String> ids(JsonNode n) {
        Set<String> out = new HashSet<>();
        collect(n, out);
        return out;
    }

    private static void collect(JsonNode n, Set<String> out) {
        if (n.isObject()) {
            n.fields().forEachRemaining(e -> {
                if ("id".equals(e.getKey()) && e.getValue().isTextual()) out.add(e.getValue().textValue());
                else collect(e.getValue(), out);
            });
        } else if (n.isArray()) {
            n.forEach(c -> collect(c, out));
        }
    }

    // ---- profile / scratch ---------------------------------------------------

    @Test
    void scratchSeedsTheHeaderFromTheBioOnlyEvenWhenTheProfileHasItems() throws Exception {
        bio("{\"firstName\":\"Ada\",\"lastName\":\"Lovelace\",\"email\":\"ada@example.com\"}");
        profileItem(ProfileSection.EXPERIENCE, "{\"title\":\"Engineer\",\"org\":\"Acme\"}");

        JsonNode res = created("{\"source\":{\"kind\":\"scratch\"}}");

        assertThat(res.at("/doc/doc/basics/name").asText()).isEqualTo("Ada Lovelace");
        assertThat(res.at("/doc/doc/sections")).isEmpty();
        assertThat(res.at("/resume/label").asText()).isEqualTo("My resume");
        assertThat(docOf(res).getSourceKind()).isEqualTo("PROFILE");
    }

    @Test
    void profileIsTheDefaultSourceAndAStringSourceIsAccepted() throws Exception {
        profileItem(ProfileSection.EXPERIENCE, "{\"title\":\"Engineer\",\"org\":\"Acme\"}");

        JsonNode implicit = created("{}");
        JsonNode named = created("{\"source\":\"profile\"}");

        assertThat(implicit.at("/doc/doc/sections/0/kind").asText()).isEqualTo("EXPERIENCE");
        assertThat(named.at("/doc/doc/sections/0/kind").asText()).isEqualTo("EXPERIENCE");
    }

    @Test
    void anUnknownSourceIs422() throws Exception {
        create("{\"source\":{\"kind\":\"telepathy\"}}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("DOC_INVALID"))
            .andExpect(jsonPath("$.path").value("$.source.kind"));
    }

    // ---- upload ----------------------------------------------------------------

    @Test
    void uploadBuildsTheDocumentFromTheParsedStructureAndNamesItAfterTheFile() throws Exception {
        bio("{\"firstName\":\"Real\",\"lastName\":\"Person\"}");

        JsonNode res = created(uploadBody(STRUCTURED, "\"bio\":{\"firstName\":\"File\",\"email\":\"f@x.io\"}"));

        assertThat(res.at("/resume/label").asText()).isEqualTo("Ada CV");
        assertThat(res.at("/doc/doc/basics/name").asText()).as("the user's bio wins").startsWith("Real");
        assertThat(res.at("/doc/doc/basics/email").asText()).isEqualTo("f@x.io");
        assertThat(res.at("/doc/doc/sections/0/kind").asText()).isEqualTo("SUMMARY");
        assertThat(res.at("/doc/doc/sections/1/kind").asText()).isEqualTo("EXPERIENCE");
        assertThat(res.at("/doc/doc/sections/1/items")).hasSize(2);
        assertThat(docOf(res).getSourceKind()).isEqualTo("UPLOAD");
        assertThat(res.at("/resume/kind").asText()).isEqualTo("BUILT");
        // the extension's mirror is written with the document
        assertThat(resumeRepository.findById(res.at("/resume/id").asLong()).orElseThrow().getParsedJson()).contains("Acme");
    }

    @Test
    void anExplicitLabelAndTheKeepMaskAreHonoured() throws Exception {
        JsonNode res = created(uploadBody(STRUCTURED, "\"keep\":{\"experience\":[1],\"education\":[],\"skills\":false,\"summary\":false}").replace("{\"source\"", "{\"label\":\"Tailored CV\",\"source\""));

        assertThat(res.at("/resume/label").asText()).isEqualTo("Tailored CV");
        JsonNode sections = res.at("/doc/doc/sections");
        assertThat(sections).hasSize(1);
        assertThat(sections.at("/0/kind").asText()).isEqualTo("EXPERIENCE");
        assertThat(sections.at("/0/items")).hasSize(1);
        assertThat(sections.at("/0/items/0/org").asText()).isEqualTo("Globex");
    }

    @Test
    void aNeverCollectedValueInAnUploadIs422AndNamesTheItemUntickingItFixesIt() throws Exception {
        String dirty = STRUCTURED.replace("\"Learned\"", "\"My SSN is 078-05-1120 on file\"");
        long before = resumeRepository.count();

        create(uploadBody(dirty, null))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"))
            .andExpect(jsonPath("$.path").value(org.hamcrest.Matchers.startsWith("structured.experience[1]")));
        assertThat(resumeRepository.count()).as("nothing created").isEqualTo(before);

        // The user unticks that entry (index 1 of the uploaded array): it is no longer in what we keep.
        created(uploadBody(dirty, "\"keep\":{\"experience\":[0]}"));
    }

    @Test
    void anUploadWithoutAStructureIs422() throws Exception {
        create("{\"source\":{\"kind\":\"upload\",\"fileName\":\"x.pdf\"}}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.path").value("$.source.structured"));
    }

    @Test
    void theCapIsCheckedBeforeAnythingElseAndNothingIsCreated() throws Exception {
        created("{\"label\":\"One\"}");
        created("{\"label\":\"Two\"}");
        created("{\"label\":\"Three\"}");
        long before = resumeRepository.count();

        // an upload that would also be refused as sensitive, and a copy of someone else's resume: 402 first for both
        create(uploadBody(STRUCTURED.replace("\"Learned\"", "\"078-05-1120\""), null)).andExpect(status().isPaymentRequired()).andExpect(jsonPath("$.code").value("RESUME_LIMIT"));
        create("{\"source\":{\"kind\":\"copy\",\"fromResumeId\":999999}}").andExpect(status().isPaymentRequired());
        assertThat(resumeRepository.count()).isEqualTo(before);
    }

    // ---- copy / duplicate ---------------------------------------------------------

    @Test
    void copyIsADeepIndependentCopyWithNewIds() throws Exception {
        JsonNode original = created(uploadBody(STRUCTURED, null).replace("{\"source\"", "{\"label\":\"Original\",\"target\":\"Backend\",\"source\""));
        long fromId = original.at("/resume/id").asLong();

        JsonNode copy = created("{\"source\":{\"kind\":\"copy\",\"fromResumeId\":" + fromId + "}}");

        assertThat(copy.at("/resume/label").asText()).isEqualTo("Original (copy)");
        ResumeDoc copyDoc = docOf(copy);
        assertThat(copyDoc.getParentResumeId()).isEqualTo(fromId);
        assertThat(copyDoc.getSourceKind()).isEqualTo("COPY");
        assertThat(copy.at("/doc/doc/meta/target").isMissingNode() || copy.at("/doc/doc/meta/target").isNull()).as("no job target is copied").isTrue();
        assertThat(copy.at("/resume/target").asText("")).isEmpty();
        // same content, different ids
        assertThat(copy.at("/doc/doc/sections/1/items/0/org").asText()).isEqualTo("Acme");
        Set<String> a = ids(original.at("/doc/doc/sections"));
        Set<String> b = ids(copy.at("/doc/doc/sections"));
        assertThat(b).isNotEmpty().hasSameSizeAs(a);
        assertThat(b).doesNotContainAnyElementsOf(a);
        assertThat(copy.at("/doc/doc/meta/title").asText()).isEqualTo("Original (copy)");
        // independent: editing the copy never touches the original
        long copyId = copy.at("/resume/id").asLong();
        String etag = "\"" + copy.at("/doc/docVersion").asInt() + "\"";
        JsonNode edited = copy.at("/doc/doc").deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) edited.at("/sections/1/items/0")).put("org", "Changed");
        mockMvc
            .perform(put("/api/profile/resumes/" + copyId + "/doc").header(HttpHeaders.IF_MATCH, etag).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(java.util.Map.of("doc", edited))))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/profile/resumes/" + fromId + "/doc")).andExpect(jsonPath("$.doc.sections[1].items[0].org").value("Acme"));
    }

    @Test
    void copyKeepsTheTemplateAndThemeOfItsSourceAndAnExplicitLabelWins() throws Exception {
        JsonNode original = created("{\"label\":\"Base\"}");
        long fromId = original.at("/resume/id").asLong();
        mockMvc
            .perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/profile/resumes/" + fromId + "/doc/theme").contentType(MediaType.APPLICATION_JSON).content("{\"theme\":{\"accent\":\"#112233\"}}"))
            .andExpect(status().isOk());

        JsonNode copy = created("{\"label\":\"Mine\",\"source\":{\"kind\":\"copy\",\"fromResumeId\":" + fromId + "}}");

        assertThat(copy.at("/resume/label").asText()).isEqualTo("Mine");
        assertThat(copy.at("/doc/templateId").asText()).isEqualTo(original.at("/doc/templateId").asText());
        assertThat(copy.at("/doc/theme/accent").asText()).isEqualTo("#112233");
    }

    @Test
    void copyOfAnUploadedFileIsBuiltFromItsParsedStructure() throws Exception {
        Resume file = new Resume().label("Old file").r2ObjectKey("").status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        file.setParsedJson(STRUCTURED);
        file.setUser(user());
        file = resumeRepository.saveAndFlush(file);

        JsonNode copy = created("{\"source\":{\"kind\":\"copy\",\"fromResumeId\":" + file.getId() + "}}");

        assertThat(copy.at("/resume/label").asText()).isEqualTo("Old file (copy)");
        assertThat(copy.at("/doc/doc/sections/1/kind").asText()).isEqualTo("EXPERIENCE");
        assertThat(docOf(copy).getSourceKind()).isEqualTo("COPY");
    }

    @Test
    void copyOfSomeoneElsesResumeIs404() throws Exception {
        User other = userRepository.findOneByLogin("admin").orElseThrow();
        Resume theirs = new Resume().label("Theirs").r2ObjectKey("").status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        theirs.setUser(other);
        theirs = resumeRepository.saveAndFlush(theirs);
        long before = resumeRepository.count();

        create("{\"source\":{\"kind\":\"copy\",\"fromResumeId\":" + theirs.getId() + "}}").andExpect(status().isNotFound());
        mockMvc.perform(post("/api/profile/resumes/" + theirs.getId() + "/doc/duplicate")).andExpect(status().isNotFound());
        assertThat(resumeRepository.count()).isEqualTo(before);
    }

    @Test
    void duplicateIsTheSameAsACopy() throws Exception {
        long fromId = created("{\"label\":\"Base\"}").at("/resume/id").asLong();

        String res = mockMvc.perform(post("/api/profile/resumes/" + fromId + "/doc/duplicate")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();

        JsonNode copy = json(res);
        assertThat(copy.at("/resume/label").asText()).isEqualTo("Base (copy)");
        assertThat(docOf(copy).getParentResumeId()).isEqualTo(fromId);
        assertThat(docOf(copy).getSourceKind()).isEqualTo("COPY");
    }

    // ---- import (uploaded -> built) -------------------------------------------------

    private Resume uploadedWithFile(String key) {
        Resume file = new Resume().label("My upload").r2ObjectKey(key).status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        file.setParsedJson(STRUCTURED);
        file.setUser(user());
        return resumeRepository.saveAndFlush(file);
    }

    @Test
    void importTurnsAnUploadedResumeIntoABuiltOneInPlaceAndKeepsTheFileAside() throws Exception {
        String fileKey = storage.objectKeyFor(user().getId(), 1L, "cv.pdf");
        storage.store(fileKey, "%PDF-original".getBytes(StandardCharsets.UTF_8), "application/pdf");
        Resume file = uploadedWithFile(fileKey);

        String res = mockMvc.perform(post("/api/profile/resumes/" + file.getId() + "/doc/import")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        JsonNode built = json(res);
        assertThat(built.at("/resume/id").asLong()).isEqualTo(file.getId());
        assertThat(built.at("/resume/kind").asText()).isEqualTo("BUILT");
        assertThat(built.at("/doc/doc/sections/1/kind").asText()).isEqualTo("EXPERIENCE");
        assertThat(resumeRepository.findById(file.getId()).orElseThrow().getKind()).isEqualTo(ResumeKind.BUILT);
        assertThat(docOf(built).getSourceKind()).isEqualTo("IMPORT");
        // the original was copied under the originals prefix (the PDF job deletes whatever is in the resume's own slot)
        String originalKey = built.at("/doc/doc/meta/originalFileKey").asText();
        assertThat(originalKey).startsWith("resume-originals/" + user().getId() + "/");
        mockMvc.perform(get("/api/profile/resumes/" + file.getId() + "/original")).andExpect(status().isOk()).andExpect(content().bytes("%PDF-original".getBytes(StandardCharsets.UTF_8)));

        // a second import is refused
        mockMvc.perform(post("/api/profile/resumes/" + file.getId() + "/doc/import")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_BUILT"));
    }

    @Test
    void importOfABuiltOrForeignResumeIsRefused() throws Exception {
        long builtId = created("{}").at("/resume/id").asLong();
        mockMvc.perform(post("/api/profile/resumes/" + builtId + "/doc/import")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_BUILT"));

        User other = userRepository.findOneByLogin("admin").orElseThrow();
        Resume theirs = new Resume().label("Theirs").r2ObjectKey("").status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        theirs.setUser(other);
        theirs = resumeRepository.saveAndFlush(theirs);
        mockMvc.perform(post("/api/profile/resumes/" + theirs.getId() + "/doc/import")).andExpect(status().isNotFound());
    }

    // ---- the original file --------------------------------------------------------------

    @Test
    void theOriginalFilePostedAfterAnUploadCreateIsKeptApartAndDownloadable() throws Exception {
        JsonNode res = created(uploadBody(STRUCTURED, null));
        long id = res.at("/resume/id").asLong();
        assertThat(res.at("/doc/doc/meta/originalFileKey").isNull()).isTrue();
        mockMvc.perform(get("/api/profile/resumes/" + id + "/original")).andExpect(status().isNotFound());

        MockMultipartFile file = new MockMultipartFile("file", "Ada CV.pdf", "application/pdf", "%PDF-mine".getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(multipart("/api/resumes/" + id + "/file").file(file)).andExpect(status().isOk());

        Resume resume = resumeRepository.findById(id).orElseThrow();
        assertThat(resume.getr2ObjectKey()).as("the PDF slot is untouched").isEmpty();
        JsonNode doc = json(mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andReturn().getResponse().getContentAsString());
        String key = doc.at("/doc/meta/originalFileKey").asText();
        assertThat(key).startsWith("resume-originals/" + user().getId() + "/");
        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/original"))
            .andExpect(status().isOk())
            .andExpect(content().bytes("%PDF-mine".getBytes(StandardCharsets.UTF_8)));

        // A save cannot point the original at another file, nor drop it.
        com.fasterxml.jackson.databind.node.ObjectNode tampered = (com.fasterxml.jackson.databind.node.ObjectNode) doc.get("doc").deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) tampered.get("meta")).put("originalFileKey", "resumes/1/someone-elses.pdf");
        String etag = "\"" + doc.get("docVersion").asInt() + "\"";
        mockMvc
            .perform(put("/api/profile/resumes/" + id + "/doc").header(HttpHeaders.IF_MATCH, etag).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(java.util.Map.of("doc", tampered))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.doc.meta.originalFileKey").value(key));
    }

    @Test
    void aFileOnAProfileBuiltResumeIsNotAnOriginal() throws Exception {
        long id = created("{}").at("/resume/id").asLong();
        MockMultipartFile file = new MockMultipartFile("file", "x.pdf", "application/pdf", "%PDF-x".getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(multipart("/api/resumes/" + id + "/file").file(file)).andExpect(status().isOk());
        assertThat(resumeRepository.findById(id).orElseThrow().getr2ObjectKey()).startsWith("resumes/");
        mockMvc.perform(get("/api/profile/resumes/" + id + "/original")).andExpect(status().isNotFound());
    }

    @Test
    void anotherUsersOriginalIs404() throws Exception {
        User other = userRepository.findOneByLogin("admin").orElseThrow();
        Resume theirs = new Resume().label("Theirs").r2ObjectKey("").status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        theirs.setKind(ResumeKind.BUILT);
        theirs.setUser(other);
        theirs = resumeRepository.saveAndFlush(theirs);
        mockMvc.perform(get("/api/profile/resumes/" + theirs.getId() + "/original")).andExpect(status().isNotFound());
        assertThat(ProfileService.FREE_RESUME_LIMIT).isEqualTo(3);
    }
}
