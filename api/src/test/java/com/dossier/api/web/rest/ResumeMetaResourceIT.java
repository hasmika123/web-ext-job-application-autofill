package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
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
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.ResumeDocVersion;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.domain.enumeration.ResumeRole;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeDocVersionRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ResumeDocService;
import com.dossier.api.service.ResumeDocVersionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for {@link ResumeMetaResource} and the metadata model behind it (Resume Builder
 * R3.9): the name's truth flip, tags/target rules, exactly-one primary, master to tailored lineage and
 * detach, checkpoints and the version history, ownership (404), and the list DTO's new fields.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class ResumeMetaResourceIT {

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
    private ResumeDocVersionRepository versionRepository;

    @Autowired
    private ResumeDocVersionService versionService;

    @Autowired
    private com.dossier.api.repository.AppSettingRepository appSettingRepository;

    @Autowired
    private com.dossier.api.service.ResumeBuilderSettings resumeBuilderSettings;

    @org.junit.jupiter.api.AfterEach
    void dropSettingsCache() {
        resumeBuilderSettings.invalidate(); // the setting rows roll back with the test transaction; the cache must not outlive them
    }

    @Autowired
    private jakarta.persistence.EntityManager em;

    // ---- helpers ------------------------------------------------------------

    private User user() {
        return userRepository.findOneByLogin("user").orElseThrow();
    }

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

    private Long createUploaded(String label) throws Exception {
        String res = mockMvc
            .perform(post("/api/profile/resumes").contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"" + label + "\",\"status\":\"NEEDS_REVIEW\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return json(res).get("id").asLong();
    }

    private ResultActions patchMeta(Long id, String body) throws Exception {
        return mockMvc.perform(patch("/api/profile/resumes/" + id + "/meta").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private JsonNode meta(Long id) throws Exception {
        return json(mockMvc.perform(get("/api/profile/resumes/" + id + "/meta")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private String profileVersion() throws Exception {
        return json(mockMvc.perform(get("/api/profile/version")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("version").asText();
    }

    private JsonNode list() throws Exception {
        return json(mockMvc.perform(get("/api/profile/resumes")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode listRow(Long id) throws Exception {
        for (JsonNode n : list()) if (n.get("id").asLong() == id) return n;
        throw new AssertionError("resume " + id + " not in the list");
    }

    private boolean isPrimary(Long id) throws Exception {
        return meta(id).get("primary").asBoolean();
    }

    /** Make a built resume a tailored child of {@code masterId}, the way tailor-copy (R5.9) will leave it. */
    private void makeTailoredChild(Long childId, Long masterId) {
        Resume child = resumeRepository.findById(childId).orElseThrow();
        child.setRole(ResumeRole.TAILORED);
        resumeRepository.saveAndFlush(child);
        ResumeDoc d = resumeDocRepository.findById(childId).orElseThrow();
        d.setParentResumeId(masterId);
        d.setParentHashAtCopy(resumeDocRepository.findById(masterId).orElseThrow().getContentHash());
        d.setSourceKind("TAILOR");
        resumeDocRepository.saveAndFlush(d);
        em.clear();
    }

    private Long otherUsersBuiltResume() throws Exception {
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

    private ObjectNode doc(String title, String summary) throws Exception {
        return (ObjectNode) json(
            "{\"schema\":2,\"meta\":{\"title\":\"" + title + "\"},\"basics\":{\"name\":\"Ada Lovelace\"},\"sections\":[" +
            "{\"id\":\"s_sum0001\",\"kind\":\"SUMMARY\",\"title\":\"Summary\",\"hidden\":false," +
            "\"items\":[{\"id\":\"i_sum0001\",\"text\":\"" + summary + "\"}]}]}"
        );
    }

    private void putDoc(Long id, int version, JsonNode doc) throws Exception {
        mockMvc
            .perform(
                put("/api/profile/resumes/" + id + "/doc")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header(HttpHeaders.IF_MATCH, "\"" + version + "\"")
                    .content(om.writeValueAsString(Map.of("doc", doc)))
            )
            .andExpect(status().isOk());
    }

    // ---- read ---------------------------------------------------------------

    @Test
    void metaOfABuiltResumeCarriesTheWholeModel() throws Exception {
        Long id = createBuilt("Backend resume");
        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/meta"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(id))
            .andExpect(jsonPath("$.name").value("Backend resume"))
            .andExpect(jsonPath("$.kind").value("BUILT"))
            .andExpect(jsonPath("$.source.kind").value("BUILT"))
            .andExpect(jsonPath("$.source.origin").value("PROFILE"))
            .andExpect(jsonPath("$.role").value("MASTER"))
            .andExpect(jsonPath("$.primary").value(true)) // the first resume auto-becomes primary
            .andExpect(jsonPath("$.starred").value(false))
            .andExpect(jsonPath("$.archived").value(false))
            .andExpect(jsonPath("$.lifecycle").value("DRAFT"))
            .andExpect(jsonPath("$.templateId").value("modern"))
            .andExpect(jsonPath("$.tags").isEmpty())
            .andExpect(jsonPath("$.createdBy.login").value("user"))
            .andExpect(jsonPath("$.updatedBy.login").value("user"))
            .andExpect(jsonPath("$.createdAt").isNotEmpty())
            .andExpect(jsonPath("$.updatedAt").isNotEmpty())
            .andExpect(jsonPath("$.pdf.status").value("PENDING")) // R3.7: a new built resume is queued for its first PDF
            .andExpect(jsonPath("$.shareWithOrg").value(true))
            .andExpect(jsonPath("$.lineage.masterId").value(id))
            .andExpect(jsonPath("$.lineage.children").value(0))
            .andExpect(jsonPath("$.lineage.masterChanged").value(false))
            .andExpect(jsonPath("$.visibility.mode").value("PRIVATE"))
            .andExpect(jsonPath("$.recruiterSharing.on").value(false))
            .andExpect(jsonPath("$.version.current").value(1)); // the first snapshot written at creation
    }

    @Test
    void metaOfAnUploadedResumeHasNoDocumentParts() throws Exception {
        Long id = createUploaded("Old CV");
        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/meta"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.kind").value("UPLOADED"))
            .andExpect(jsonPath("$.source.kind").value("UPLOADED"))
            .andExpect(jsonPath("$.templateId").doesNotExist())
            .andExpect(jsonPath("$.lifecycle").value("ACTIVE")) // a file has nothing to finish
            .andExpect(jsonPath("$.pdf.status").value("NONE"))
            .andExpect(jsonPath("$.createdBy.login").value("user"))
            .andExpect(jsonPath("$.role").value("MASTER"));
    }

    // ---- name truth flip -----------------------------------------------------

    @Test
    void renameMirrorsIntoTheDocumentWithoutTickingItsVersion() throws Exception {
        Long id = createBuilt("Draft");
        String before = profileVersion();

        patchMeta(id, "{\"name\":\"  Backend SWE - 2026  \"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Backend SWE - 2026"));

        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/doc"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ETAG, "\"1\"")) // an open editor's If-Match stays valid
            .andExpect(jsonPath("$.label").value("Backend SWE - 2026"))
            .andExpect(jsonPath("$.doc.meta.title").value("Backend SWE - 2026"));
        assertThat(resumeRepository.findById(id).orElseThrow().getLabel()).isEqualTo("Backend SWE - 2026");
        assertThat(profileVersion()).isNotEqualTo(before); // the extension re-pulls on a rename
    }

    @Test
    void aClientPutCannotRenameThroughTheDocument() throws Exception {
        Long id = createBuilt("Real name");
        putDoc(id, 1, doc("Sneaky", "text"));
        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/doc"))
            .andExpect(jsonPath("$.label").value("Real name"))
            .andExpect(jsonPath("$.doc.meta.title").value("Real name"));
        assertThat(resumeRepository.findById(id).orElseThrow().getLabel()).isEqualTo("Real name");
    }

    @Test
    void renamingAnUploadedResumeWorks() throws Exception {
        Long id = createUploaded("Old CV");
        patchMeta(id, "{\"name\":\"New CV\"}").andExpect(status().isOk()).andExpect(jsonPath("$.name").value("New CV"));
        assertThat(resumeRepository.findById(id).orElseThrow().getLabel()).isEqualTo("New CV");
    }

    @Test
    void renameKeepsAFreshPdfFresh() throws Exception {
        Long id = createBuilt("Draft");
        String hash = resumeDocRepository.findById(id).orElseThrow().getContentHash();
        String renderHash = ResumeDocService.renderHash(resumeDocRepository.findById(id).orElseThrow());
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/export-recorded").contentType(MediaType.APPLICATION_JSON).content("{\"hash\":\"" + renderHash + "\"}"))
            .andExpect(status().isNoContent());
        em.clear();

        patchMeta(id, "{\"name\":\"Renamed\"}").andExpect(status().isOk()).andExpect(jsonPath("$.pdf.status").value("READY"));
        ResumeDoc d = resumeDocRepository.findById(id).orElseThrow();
        assertThat(d.getContentHash()).isNotEqualTo(hash); // the title is part of the document hash
        assertThat(d.getExportedHash()).isEqualTo(ResumeDocService.renderHash(d)); // but the stored PDF still matches the new render hash
    }

    // ---- validation ------------------------------------------------------------

    @Test
    void nameRules() throws Exception {
        Long id = createBuilt("Mine");
        patchMeta(id, "{\"name\":\"   \"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("META_INVALID"));
        patchMeta(id, "{\"name\":\"" + "x".repeat(201) + "\"}").andExpect(status().isUnprocessableEntity());
        patchMeta(id, "{\"name\":\"" + "x".repeat(200) + "\"}").andExpect(status().isOk());
        patchMeta(id, "{\"name\":5}").andExpect(status().isUnprocessableEntity());
    }

    @Test
    void targetRules() throws Exception {
        Long id = createBuilt("Mine");
        patchMeta(id, "{\"target\":\"" + "t".repeat(81) + "\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("META_INVALID"));
        patchMeta(id, "{\"target\":\"Backend SWE\"}").andExpect(status().isOk()).andExpect(jsonPath("$.target").value("Backend SWE"));
        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(jsonPath("$.doc.meta.target").value("Backend SWE"));
        patchMeta(id, "{\"target\":null}").andExpect(status().isOk()).andExpect(jsonPath("$.target").doesNotExist());
        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(jsonPath("$.doc.meta.target").doesNotExist());
    }

    @Test
    void tagRules() throws Exception {
        Long id = createBuilt("Mine");
        patchMeta(id, "{\"tags\":[\"  Backend \",\"BACKEND\",\"2026\",\"\"]}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.tags[0]").value("backend"))
            .andExpect(jsonPath("$.tags[1]").value("2026"))
            .andExpect(jsonPath("$.tags[2]").doesNotExist());
        patchMeta(id, "{\"tags\":[\"" + "a".repeat(25) + "\"]}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("META_INVALID"));
        patchMeta(id, "{\"tags\":[\"1\",\"2\",\"3\",\"4\",\"5\",\"6\",\"7\",\"8\",\"9\",\"10\",\"11\"]}").andExpect(status().isUnprocessableEntity());
        patchMeta(id, "{\"tags\":\"nope\"}").andExpect(status().isUnprocessableEntity());
        patchMeta(id, "{\"tags\":[]}").andExpect(status().isOk()).andExpect(jsonPath("$.tags").isEmpty());
    }

    @Test
    void tagsTargetAndShareWithOrgDoNotMoveTheExtensionsVersion() throws Exception {
        Long id = createBuilt("Mine");
        em.flush();
        em.clear(); // read the row back from the database, as a separate request would (timestamps lose their sub-microseconds)
        String before = profileVersion();
        patchMeta(id, "{\"tags\":[\"x\"],\"target\":\"Y\",\"shareWithOrg\":false}").andExpect(status().isOk()).andExpect(jsonPath("$.shareWithOrg").value(false));
        assertThat(profileVersion()).isEqualTo(before);
    }

    // ---- primary -------------------------------------------------------------

    @Test
    void settingAnotherResumeAsPrimaryClearsTheOldOne() throws Exception {
        Long a = createBuilt("A");
        Long b = createBuilt("B");
        assertThat(isPrimary(a)).isTrue();
        assertThat(isPrimary(b)).isFalse();

        patchMeta(b, "{\"primary\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.primary").value(true));
        assertThat(isPrimary(a)).isFalse();
        // the extension's flag moves with it
        assertThat(listRow(b).get("defaultResume").asBoolean()).isTrue();
        assertThat(listRow(b).get("primary").asBoolean()).isTrue();
        assertThat(listRow(a).get("defaultResume").asBoolean()).isFalse();
    }

    @Test
    void thePrimaryCannotBeUnsetOrArchivedWhileOthersAreLive() throws Exception {
        Long a = createBuilt("A");
        Long b = createBuilt("B");
        patchMeta(a, "{\"primary\":false}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PRIMARY_REQUIRED"));
        patchMeta(a, "{\"archived\":true}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PRIMARY_REQUIRED"));
        assertThat(isPrimary(a)).isTrue();

        // promote first, then archiving the old primary is fine
        patchMeta(b, "{\"primary\":true}").andExpect(status().isOk());
        patchMeta(a, "{\"archived\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.archived").value(true)).andExpect(jsonPath("$.lifecycle").value("ARCHIVED"));
        assertThat(isPrimary(b)).isTrue();
    }

    @Test
    void anArchivedResumeCannotBePrimary() throws Exception {
        Long a = createBuilt("A");
        Long b = createBuilt("B");
        patchMeta(b, "{\"archived\":true}").andExpect(status().isOk());
        patchMeta(b, "{\"primary\":true}").andExpect(status().isUnprocessableEntity());
        patchMeta(b, "{\"archived\":true,\"primary\":true}").andExpect(status().isUnprocessableEntity());
        assertThat(isPrimary(a)).isTrue();
    }

    @Test
    void thereIsExactlyOnePrimaryAfterEveryArchiveAndDelete() throws Exception {
        Long a = createBuilt("A");
        Long b = createBuilt("B");
        Long c = createBuilt("C");
        assertThat(primaries()).containsExactly(a);

        // legacy archive of the primary (what the web's list does today) promotes another one
        mockMvc.perform(put("/api/profile/resumes/" + a).contentType(MediaType.APPLICATION_JSON).content("{\"archived\":true}")).andExpect(status().isOk());
        assertThat(primaries()).hasSize(1).doesNotContain(a);
        Long second = primaries().get(0);

        // deleting the primary promotes another one too
        deleteResume(second);
        assertThat(primaries()).hasSize(1).doesNotContain(a, second);

        // unarchiving never creates a second primary
        mockMvc.perform(put("/api/profile/resumes/" + a).contentType(MediaType.APPLICATION_JSON).content("{\"archived\":false}")).andExpect(status().isOk());
        assertThat(primaries()).hasSize(1);
        assertThat(List.of(b, c)).containsAnyElementsOf(primaries());
    }

    @Test
    void archivingTheOnlyLiveResumeIsAllowed() throws Exception {
        Long a = createBuilt("A");
        patchMeta(a, "{\"archived\":true}").andExpect(status().isOk());
        // a new resume after everything is archived becomes the primary
        Long b = createBuilt("B");
        assertThat(isPrimary(b)).isTrue();
        assertThat(isPrimary(a)).isFalse();
    }

    /** A real DELETE runs in its own persistence context, where the documents were never loaded (see ResumeDocResourceIT). */
    private void deleteResume(Long id) throws Exception {
        em.flush();
        em.clear();
        mockMvc.perform(delete("/api/profile/resumes/" + id)).andExpect(status().isNoContent());
        em.flush();
        em.clear();
    }

    private List<Long> primaries() throws Exception {
        List<Long> out = new java.util.ArrayList<>();
        for (JsonNode n : list()) {
            if (n.path("archived").asBoolean(false)) continue;
            if (n.path("defaultResume").asBoolean(false)) out.add(n.get("id").asLong());
        }
        return out;
    }

    // ---- lineage -----------------------------------------------------------------

    @Test
    void lineageOfAMasterWithATailoredChild() throws Exception {
        Long master = createBuilt("Master");
        Long child = createBuilt("For Stripe");
        makeTailoredChild(child, master);

        mockMvc
            .perform(get("/api/profile/resumes/" + master + "/lineage"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.self").value("MASTER"))
            .andExpect(jsonPath("$.master.id").value(master))
            .andExpect(jsonPath("$.children.length()").value(1))
            .andExpect(jsonPath("$.children[0].id").value(child))
            .andExpect(jsonPath("$.children[0].name").value("For Stripe"))
            .andExpect(jsonPath("$.children[0].masterChanged").value(false));
        mockMvc.perform(get("/api/profile/resumes/" + master + "/meta")).andExpect(jsonPath("$.lineage.children").value(1));

        // from the child's side
        mockMvc
            .perform(get("/api/profile/resumes/" + child + "/lineage"))
            .andExpect(jsonPath("$.self").value("TAILORED"))
            .andExpect(jsonPath("$.master.id").value(master))
            .andExpect(jsonPath("$.master.name").value("Master"));
        mockMvc
            .perform(get("/api/profile/resumes/" + child + "/meta"))
            .andExpect(jsonPath("$.role").value("TAILORED"))
            .andExpect(jsonPath("$.lineage.masterId").value(master))
            .andExpect(jsonPath("$.lineage.masterName").value("Master"))
            .andExpect(jsonPath("$.source.tailoredFrom.resumeId").value(master))
            .andExpect(jsonPath("$.source.tailoredFrom.label").value("Master"));
    }

    @Test
    void masterChangedTurnsTrueOnceTheMasterMovesOn() throws Exception {
        Long master = createBuilt("Master");
        Long child = createBuilt("Child");
        makeTailoredChild(child, master);
        putDoc(master, 1, doc("Master", "Edited after the copy"));
        em.clear();

        mockMvc.perform(get("/api/profile/resumes/" + master + "/lineage")).andExpect(jsonPath("$.children[0].masterChanged").value(true));
        mockMvc.perform(get("/api/profile/resumes/" + child + "/meta")).andExpect(jsonPath("$.lineage.masterChanged").value(true));
    }

    @Test
    void lineageOfAnUploadedResumeIsItself() throws Exception {
        Long id = createUploaded("CV");
        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/lineage"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.self").value("MASTER"))
            .andExpect(jsonPath("$.master.id").value(id))
            .andExpect(jsonPath("$.children").isEmpty());
    }

    @Test
    void detachTurnsATailoredResumeIntoAMaster() throws Exception {
        Long master = createBuilt("Master");
        Long child = createBuilt("Child");
        makeTailoredChild(child, master);

        mockMvc
            .perform(post("/api/profile/resumes/" + child + "/detach"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("MASTER"))
            .andExpect(jsonPath("$.lineage.masterId").value(child))
            .andExpect(jsonPath("$.source.tailoredFrom").doesNotExist());
        ResumeDoc d = resumeDocRepository.findById(child).orElseThrow();
        assertThat(d.getParentResumeId()).isNull();
        assertThat(d.getParentHashAtCopy()).isNull();
        assertThat(versionRepository.findRows(child, user().getId()).stream().map(ResumeDocVersionRepository.VersionRow::getReason)).contains("DETACH");
        mockMvc.perform(get("/api/profile/resumes/" + master + "/lineage")).andExpect(jsonPath("$.children").isEmpty());
    }

    @Test
    void detachingAMasterOrAnUploadIs409() throws Exception {
        Long master = createBuilt("Master");
        Long up = createUploaded("CV");
        mockMvc.perform(post("/api/profile/resumes/" + master + "/detach")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_TAILORED"));
        mockMvc.perform(post("/api/profile/resumes/" + up + "/detach")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_TAILORED"));
    }

    @Test
    void deletingAMasterDetachesItsChildren() throws Exception {
        Long master = createBuilt("Master");
        Long child = createBuilt("Child");
        makeTailoredChild(child, master);
        deleteResume(master);
        assertThat(resumeRepository.findById(child).orElseThrow().getRole()).isEqualTo(ResumeRole.MASTER);
        assertThat(resumeDocRepository.findById(child).orElseThrow().getParentResumeId()).isNull();
    }

    // ---- checkpoint and versions -------------------------------------------------

    @Test
    void checkpointWritesManualAndNamedVersionsAndEndsTheDraft() throws Exception {
        Long id = createBuilt("Mine");
        assertThat(meta(id).get("lifecycle").asText()).isEqualTo("DRAFT");

        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/doc/checkpoint").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.versionNo").value(2))
            .andExpect(jsonPath("$.reason").value("MANUAL"))
            .andExpect(jsonPath("$.pdf.status").value("PENDING"));
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/doc/checkpoint").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"  Sent to Acme \"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.versionNo").value(3))
            .andExpect(jsonPath("$.reason").value("NAMED"));

        JsonNode m = meta(id);
        assertThat(m.get("lifecycle").asText()).isEqualTo("ACTIVE");
        assertThat(m.at("/version/current").asInt()).isEqualTo(3);
        assertThat(m.at("/version/latest/name").asText()).isEqualTo("Sent to Acme");
        assertThat(m.at("/version/latest/kind").asText()).isEqualTo("named");
        assertThat(listRow(id).get("lifecycle").asText()).isEqualTo("ACTIVE");
    }

    @Test
    void checkpointQueuesThePdfAtOnceWithoutTickingTheDocumentVersion() throws Exception {
        Long id = createBuilt("Mine");
        // Pretend the first PDF exists and is current: a checkpoint then has nothing to render.
        ResumeDoc before = resumeDocRepository.findById(id).orElseThrow();
        resumeDocRepository.markReady(id, before.getDocVersion(), ResumeDocService.renderHash(before), Instant.now());
        em.clear();
        assertThat(resumeDocRepository.findById(id).orElseThrow().getPdfStatus()).isEqualTo("READY");
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/doc/checkpoint").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(jsonPath("$.pdf.status").value("READY")); // current: nothing to render

        // Make the stored PDF fall behind the document without a save (so no PENDING marker exists yet).
        resumeDocRepository.recordExport(id, "0".repeat(64), Instant.now()); // the stored PDF is now behind the document
        em.clear();
        ResumeDoc stale = resumeDocRepository.findById(id).orElseThrow();
        int versionBefore = stale.getDocVersion();
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/doc/checkpoint").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Sent\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.pdf.status").value("PENDING"));
        em.clear();
        ResumeDoc after = resumeDocRepository.findById(id).orElseThrow();
        assertThat(after.getPdfStatus()).isEqualTo("PENDING");
        assertThat(after.getPdfNextAttemptAt()).isBeforeOrEqualTo(Instant.now().plusSeconds(1)); // no settle delay
        assertThat(after.getPdfAttempts()).isZero();
        assertThat(after.getDocVersion()).isEqualTo(versionBefore); // the open editor's ETag stays valid
        assertThat(meta(id).at("/pdf/status").asText()).isEqualTo("PENDING");
    }

    @Test
    void checkpointRefusesALongNameAndAnUpload() throws Exception {
        Long id = createBuilt("Mine");
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/doc/checkpoint").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"" + "n".repeat(81) + "\"}"))
            .andExpect(status().isUnprocessableEntity());
        Long up = createUploaded("CV");
        mockMvc.perform(post("/api/profile/resumes/" + up + "/doc/checkpoint").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
    }

    @Test
    void versionsListCarriesByAndKindNewestFirst() throws Exception {
        // R2.8 gate: only Modern is enabled by default, so enable Classic for this test (rolled back with it)
        appSettingRepository.saveAndFlush(new com.dossier.api.domain.AppSetting("resume.templates.enabled", "[\"modern\",\"classic\"]", "it", Instant.now()));
        resumeBuilderSettings.invalidate();
        Long id = createBuilt("Mine");
        mockMvc.perform(post("/api/profile/resumes/" + id + "/doc/checkpoint").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"v1.0\"}")).andExpect(status().isOk());
        mockMvc
            .perform(patch("/api/profile/resumes/" + id + "/doc/template").contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":\"classic\"}"))
            .andExpect(status().isOk());

        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/doc/versions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(3))
            .andExpect(jsonPath("$[0].reason").value("TEMPLATE_SWITCH"))
            .andExpect(jsonPath("$[0].kind").value("system"))
            .andExpect(jsonPath("$[0].by.login").value("user"))
            .andExpect(jsonPath("$[1].reason").value("NAMED"))
            .andExpect(jsonPath("$[1].kind").value("named"))
            .andExpect(jsonPath("$[1].name").value("v1.0"))
            .andExpect(jsonPath("$[2].reason").value("IMPORT"))
            .andExpect(jsonPath("$[2].versionNo").value(1));
    }

    @Test
    void versionTextIsThePlainTextOfThatVersion() throws Exception {
        Long id = createBuilt("Mine");
        putDoc(id, 1, doc("Mine", "First summary text"));
        mockMvc.perform(post("/api/profile/resumes/" + id + "/doc/checkpoint").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
        putDoc(id, 2, doc("Mine", "Second summary text"));

        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/doc/versions/2/text"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("First summary text")))
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("Second summary text"))));
        mockMvc.perform(get("/api/profile/resumes/" + id + "/doc/versions/99/text")).andExpect(status().isNotFound());
    }

    @Test
    void restoreMakesAnEarlierVersionCurrentAndKeepsTheWorkItReplaces() throws Exception {
        Long id = createBuilt("Mine");
        putDoc(id, 1, doc("Mine", "First summary text"));
        mockMvc.perform(post("/api/profile/resumes/" + id + "/doc/checkpoint").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Sent\"}")).andExpect(status().isOk());
        putDoc(id, 2, doc("Mine", "Second summary text"));
        int docVersionBefore = resumeDocRepository.findById(id).orElseThrow().getDocVersion();

        // version 2 is the "Sent" checkpoint (the first summary text)
        MvcResult restored = mockMvc
            .perform(post("/api/profile/resumes/" + id + "/doc/versions/2/restore"))
            .andExpect(status().isOk())
            .andExpect(header().exists(HttpHeaders.ETAG))
            .andExpect(jsonPath("$.doc.sections[0].items[0].text").value("First summary text"))
            .andExpect(jsonPath("$.doc.meta.title").value("Mine"))
            .andReturn();
        assertThat(json(restored.getResponse().getContentAsString()).get("docVersion").asInt()).isGreaterThan(docVersionBefore);
        // the stored projection moved with it, and the second text is still reachable as a version
        assertThat(resumeRepository.findById(id).orElseThrow().getParsedJson()).contains("First summary text");
        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/doc/versions"))
            .andExpect(jsonPath("$[0].reason").value("RESTORE"))
            .andExpect(jsonPath("$[0].kind").value("system"));
        boolean second = false;
        for (JsonNode row : json(mockMvc.perform(get("/api/profile/resumes/" + id + "/doc/versions")).andReturn().getResponse().getContentAsString())) {
            int n = row.get("versionNo").asInt();
            String text = mockMvc.perform(get("/api/profile/resumes/" + id + "/doc/versions/" + n + "/text")).andReturn().getResponse().getContentAsString();
            if (text.contains("Second summary text")) second = true;
        }
        assertThat(second).as("the content the restore replaced was written as a version first").isTrue();
    }

    @Test
    void restoreKeepsTheNameAndRefusesAnUnknownVersionOrAnotherUsersResume() throws Exception {
        Long id = createBuilt("Mine");
        putDoc(id, 1, doc("Mine", "First"));
        mockMvc.perform(post("/api/profile/resumes/" + id + "/doc/checkpoint").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
        patchMeta(id, "{\"name\":\"Renamed after\"}").andExpect(status().isOk());
        mockMvc
            .perform(post("/api/profile/resumes/" + id + "/doc/versions/2/restore"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.label").value("Renamed after"))
            .andExpect(jsonPath("$.doc.meta.title").value("Renamed after")); // the name is the resume's truth, not the old document's
        mockMvc.perform(post("/api/profile/resumes/" + id + "/doc/versions/99/restore")).andExpect(status().isNotFound());
        Long theirs = otherUsersBuiltResume();
        mockMvc.perform(post("/api/profile/resumes/" + theirs + "/doc/versions/1/restore")).andExpect(status().isNotFound());
    }

    @Test
    void autosaveRowsCoalesceInsideTheWindowAndAreWrittenAfterIt() throws Exception {
        Long id = createBuilt("Mine");
        long rows = versionRepository.findRows(id, user().getId()).size();
        assertThat(rows).isEqualTo(1);

        putDoc(id, 1, doc("Mine", "one")); // inside the window of the creation snapshot
        assertThat(versionRepository.findRows(id, user().getId())).hasSize(1);

        // age the latest row past the window: the next changed save writes an AUTOSAVE row
        ResumeDocVersion latest = versionRepository.findFirstByResumeIdAndUserIdOrderByVersionNoDesc(id, user().getId()).orElseThrow();
        latest.setCreatedAt(Instant.now().minus(1, ChronoUnit.HOURS));
        versionRepository.saveAndFlush(latest);
        putDoc(id, 2, doc("Mine", "two"));
        List<ResumeDocVersionRepository.VersionRow> after = versionRepository.findRows(id, user().getId());
        assertThat(after).hasSize(2);
        assertThat(after.get(0).getReason()).isEqualTo("AUTOSAVE");
        assertThat(after.get(0).getCreatedByLogin()).isEqualTo("user");

        // a save that changes nothing writes nothing even past the window
        ResumeDocVersion again = versionRepository.findFirstByResumeIdAndUserIdOrderByVersionNoDesc(id, user().getId()).orElseThrow();
        again.setCreatedAt(Instant.now().minus(1, ChronoUnit.HOURS));
        versionRepository.saveAndFlush(again);
        putDoc(id, 3, doc("Mine", "two"));
        assertThat(versionRepository.findRows(id, user().getId())).hasSize(2);
    }

    @Test
    void retentionTrimsAutomaticRowsButKeepsCheckpointsAndNamedVersions() throws Exception {
        Long id = createBuilt("Mine");
        ResumeDoc d = resumeDocRepository.findById(id).orElseThrow();
        versionService.record(d, ResumeDocVersionService.NAMED, "keep me", "user");
        versionService.record(d, ResumeDocVersionService.MANUAL, null, "user");
        for (int i = 0; i < 40; i++) versionService.record(d, ResumeDocVersionService.AUTOSAVE, null, "user");

        List<ResumeDocVersionRepository.VersionRow> rows = versionRepository.findRows(id, user().getId());
        long automatic = rows.stream().filter(r -> !r.getReason().equals("NAMED") && !r.getReason().equals("MANUAL")).count();
        assertThat(automatic).isEqualTo(30); // resume.versions.retentionAuto default
        assertThat(rows.stream().filter(r -> r.getReason().equals("NAMED")).count()).isEqualTo(1);
        assertThat(rows.stream().filter(r -> r.getReason().equals("MANUAL")).count()).isEqualTo(1);
    }

    // ---- list DTO -------------------------------------------------------------------

    @Test
    void theListNowExposesTheMetadata() throws Exception {
        Long id = createBuilt("Backend resume");
        patchMeta(id, "{\"target\":\"Backend SWE\",\"tags\":[\"2026\",\"remote\"]}").andExpect(status().isOk());
        Long up = createUploaded("CV");

        JsonNode row = listRow(id);
        assertThat(row.get("updatedAt").asText()).isNotBlank();
        assertThat(row.get("primary").asBoolean()).isTrue();
        assertThat(row.get("target").asText()).isEqualTo("Backend SWE");
        assertThat(row.get("tags").get(0).asText()).isEqualTo("2026");
        assertThat(row.get("role").asText()).isEqualTo("MASTER");
        assertThat(row.at("/createdBy/login").asText()).isEqualTo("user");
        assertThat(row.at("/updatedBy/login").asText()).isEqualTo("user");
        assertThat(row.get("lifecycle").asText()).isEqualTo("DRAFT");
        assertThat(row.get("shareWithOrg").asBoolean()).isTrue();

        JsonNode upRow = listRow(up);
        assertThat(upRow.get("lifecycle").asText()).isEqualTo("ACTIVE");
        assertThat(upRow.get("primary").asBoolean()).isFalse();
        assertThat(upRow.get("updatedAt").asText()).isNotBlank();
    }

    @Test
    void shareWithOrgDefaultsTrueAndIsPatchable() throws Exception {
        Long id = createBuilt("Mine");
        assertThat(meta(id).get("shareWithOrg").asBoolean()).isTrue();
        patchMeta(id, "{\"shareWithOrg\":false}").andExpect(status().isOk()).andExpect(jsonPath("$.visibility.shareWithOrg").value(false));
        assertThat(resumeRepository.findById(id).orElseThrow().getShareWithOrg()).isFalse();
    }

    @Test
    void everyWritePathStampsUpdatedBy() throws Exception {
        Long id = createBuilt("Mine");
        Resume r = resumeRepository.findById(id).orElseThrow();
        r.setUpdatedByLogin("somebody-else");
        resumeRepository.saveAndFlush(r);
        putDoc(id, 1, doc("Mine", "edit"));
        assertThat(resumeRepository.findById(id).orElseThrow().getUpdatedByLogin()).isEqualTo("user");

        r = resumeRepository.findById(id).orElseThrow();
        r.setUpdatedByLogin("somebody-else");
        resumeRepository.saveAndFlush(r);
        patchMeta(id, "{\"starred\":true}").andExpect(status().isOk());
        assertThat(resumeRepository.findById(id).orElseThrow().getUpdatedByLogin()).isEqualTo("user");
    }

    // ---- ownership -----------------------------------------------------------------------

    @Test
    void anotherUsersResumeIs404ForEveryVerb() throws Exception {
        Long theirs = otherUsersBuiltResume();
        String base = "/api/profile/resumes/" + theirs;
        mockMvc.perform(get(base + "/meta")).andExpect(status().isNotFound());
        patchMeta(theirs, "{\"name\":\"Mine now\"}").andExpect(status().isNotFound());
        mockMvc.perform(get(base + "/lineage")).andExpect(status().isNotFound());
        mockMvc.perform(post(base + "/detach")).andExpect(status().isNotFound());
        mockMvc.perform(post(base + "/doc/checkpoint").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
        mockMvc.perform(get(base + "/doc/versions")).andExpect(status().isNotFound());
        mockMvc.perform(get(base + "/doc/versions/1/text")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/profile/resumes/999999/meta")).andExpect(status().isNotFound());
        assertThat(resumeRepository.findById(theirs).orElseThrow().getLabel()).isEqualTo("Theirs");
    }
}
