package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.domain.enumeration.Provenance;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for {@link ProfileItemResource} (Resume Builder R1.1): CRUD, ownership (404 for
 * another user's items), reorder, the one-time seed from the default resume (idempotent, redacted),
 * import (merge, no duplicates, atomic refusal), the never-collected check (422 SENSITIVE_CONTENT),
 * provenance stamping on bio writes, the completeness math and its cache, and that none of it moves
 * the profile version the extension polls.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class ProfileItemResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private ProfileItemRepository itemRepository;

    @Autowired
    private BioRepository bioRepository;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AppSettingRepository appSettingRepository;

    @Autowired
    private ResumeBuilderSettings settings;

    // ---- helpers ------------------------------------------------------------------------------

    private User user() {
        return userRepository.findOneByLogin("user").orElseThrow();
    }

    private JsonNode json(String s) throws Exception {
        return om.readTree(s);
    }

    private ResultActions postItem(String body) throws Exception {
        return mockMvc.perform(post("/api/profile/items").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private JsonNode createItem(String section, String dataJson) throws Exception {
        String res = postItem("{\"section\":\"" + section + "\",\"dataJson\":" + dataJson + "}")
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return json(res);
    }

    private JsonNode exp(String title, String org) throws Exception {
        return createItem("EXPERIENCE", "{\"title\":\"" + title + "\",\"org\":\"" + org + "\",\"bullets\":[{\"text\":\"Did a thing\"}]}");
    }

    private JsonNode list(String query) throws Exception {
        return json(mockMvc.perform(get("/api/profile/items" + query)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private List<Long> ids(JsonNode arr) {
        List<Long> out = new ArrayList<>();
        arr.forEach(n -> out.add(n.get("id").asLong()));
        return out;
    }

    private static String customItems(int n) {
        StringBuilder sb = new StringBuilder("{\"items\":[");
        for (int i = 0; i < n; i++) sb.append(i == 0 ? "" : ",").append("{\"section\":\"CUSTOM\",\"dataJson\":{\"title\":\"t").append(i).append("\"}}");
        return sb.append("]}").toString();
    }

    private void setting(String key, String value) {
        appSettingRepository.saveAndFlush(new AppSetting(key, value, "it", Instant.now()));
        settings.invalidate();
    }

    @AfterEach
    void dropSettingsCache() {
        settings.invalidate(); // the setting rows roll back with the test transaction; the cache must not outlive them
    }

    private ResultActions importItems(String body) throws Exception {
        return mockMvc.perform(post("/api/profile/items/import").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private void putBio(Map<String, Object> bio) throws Exception {
        mockMvc
            .perform(put("/api/profile").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(Map.of("payload", om.writeValueAsString(bio)))))
            .andExpect(status().isOk());
    }

    private Bio bioRow() {
        return bioRepository.findByUserId(user().getId()).stream().findFirst().orElse(null);
    }

    private JsonNode meta() throws Exception {
        Bio b = bioRow();
        return b == null || b.getMetaJson() == null ? om.createObjectNode() : json(b.getMetaJson());
    }

    private String version() throws Exception {
        return json(mockMvc.perform(get("/api/profile/version")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("version").asText();
    }

    private Resume saveResume(boolean isDefault, String parsedJson) {
        Resume r = new Resume().label("Main").r2ObjectKey("").status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        r.setUser(user());
        r.setDefaultResume(isDefault);
        r.setParsedJson(parsedJson);
        return resumeRepository.saveAndFlush(r);
    }

    private ProfileItem otherUsersItem() {
        User other = userRepository.findOneByLogin("admin").orElseThrow();
        ProfileItem p = new ProfileItem();
        p.setUser(other);
        p.setSection(ProfileSection.EXPERIENCE);
        p.setPosition(0);
        p.setDataJson("{\"title\":\"Secret\",\"org\":\"Theirs\"}");
        p.setProvenance(Provenance.USER);
        return itemRepository.saveAndFlush(p);
    }

    private static final String PARSED =
        "{\"summary\":\"x\",\"skills\":[\"Java\",\"SQL\"]," +
        "\"experience\":[{\"company\":\"Acme Inc\",\"title\":\"Engineer\",\"location\":\"NYC\",\"startDate\":\"Jan 2020\",\"endDate\":\"Present\",\"current\":true," +
        "\"bullets\":[\"Built a thing\",\"Born March 3, 1990 in Ohio\"]}]," +
        "\"education\":[{\"school\":\"MIT\",\"degree\":\"BS\",\"field\":\"CS\",\"startDate\":\"2012\",\"endDate\":\"2016\",\"gpa\":\"\",\"location\":\"\"}]," +
        "\"languages\":[],\"projects\":[{\"name\":\"Kiwi\",\"bullets\":[\"Shipped\"]}]}";

    // ---- CRUD ---------------------------------------------------------------------------------

    @Test
    void createReadUpdateHideDelete() throws Exception {
        JsonNode created = createItem("EXPERIENCE", "{\"title\":\"Engineer\",\"org\":\"Acme\",\"bullets\":[{\"text\":\"Did a thing\",\"src\":\"user\"}]}");
        long id = created.get("id").asLong();
        assertThat(created.get("section").asText()).isEqualTo("EXPERIENCE");
        assertThat(created.get("position").asInt()).isZero();
        assertThat(created.get("provenance").asText()).isEqualTo("USER");
        assertThat(created.get("hidden").asBoolean()).isFalse();
        assertThat(created.get("data").get("title").asText()).isEqualTo("Engineer");
        assertThat(created.get("data").get("bullets").get(0).get("text").asText()).isEqualTo("Did a thing");

        assertThat(ids(list(""))).containsExactly(id);
        assertThat(ids(list("?section=EDUCATION"))).isEmpty();
        assertThat(ids(list("?section=EXPERIENCE"))).containsExactly(id);

        mockMvc
            .perform(put("/api/profile/items/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"dataJson\":{\"title\":\"Staff Engineer\",\"org\":\"Acme\"},\"provenance\":\"USER\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.title").value("Staff Engineer"))
            .andExpect(jsonPath("$.data.bullets").doesNotExist());

        mockMvc
            .perform(put("/api/profile/items/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"hidden\":true}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.hidden").value(true))
            .andExpect(jsonPath("$.data.title").value("Staff Engineer")); // only what was sent changed
        assertThat(ids(list(""))).containsExactly(id); // hidden items are still listed

        mockMvc.perform(delete("/api/profile/items/" + id)).andExpect(status().isNoContent());
        assertThat(list("")).isEmpty();
        ProfileItem row = itemRepository.findById(id).orElseThrow();
        assertThat(row.getDeletedAt()).isNotNull(); // soft delete: the row stays for the retention purge
        mockMvc.perform(delete("/api/profile/items/" + id)).andExpect(status().isNotFound());
        mockMvc.perform(put("/api/profile/items/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"hidden\":false}")).andExpect(status().isNotFound());
    }

    @Test
    void dataAliasIsAccepted() throws Exception {
        postItem("{\"section\":\"LANGUAGE\",\"data\":{\"name\":\"French\",\"level\":\"Fluent\"}}")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.name").value("French"));
    }

    @Test
    void positionsAppendThenInsertAndMove() throws Exception {
        long a = exp("A", "Org").get("id").asLong();
        long b = exp("B", "Org").get("id").asLong();
        long c = exp("C", "Org").get("id").asLong();
        assertThat(ids(list("?section=EXPERIENCE"))).containsExactly(a, b, c);

        JsonNode d = createItem("EXPERIENCE", "{\"title\":\"D\",\"org\":\"Org\"}");
        postItem("{\"section\":\"EXPERIENCE\",\"dataJson\":{\"title\":\"E\",\"org\":\"Org\"},\"position\":0}").andExpect(status().isCreated());
        JsonNode all = list("?section=EXPERIENCE");
        assertThat(all.get(0).get("data").get("title").asText()).isEqualTo("E");
        for (int i = 0; i < all.size(); i++) assertThat(all.get(i).get("position").asInt()).isEqualTo(i);

        long dId = d.get("id").asLong();
        mockMvc.perform(put("/api/profile/items/" + dId).contentType(MediaType.APPLICATION_JSON).content("{\"position\":1}")).andExpect(status().isOk());
        assertThat(ids(list("?section=EXPERIENCE")).subList(0, 2)).contains(dId);
        assertThat(list("?section=EXPERIENCE").get(1).get("id").asLong()).isEqualTo(dId);

        mockMvc.perform(delete("/api/profile/items/" + a)).andExpect(status().isNoContent());
        JsonNode after = list("?section=EXPERIENCE");
        for (int i = 0; i < after.size(); i++) assertThat(after.get(i).get("position").asInt()).isEqualTo(i); // gap closed
    }

    @Test
    void anotherUsersItemIs404ForEveryVerb() throws Exception {
        ProfileItem theirs = otherUsersItem();
        long id = theirs.getId();
        mockMvc.perform(put("/api/profile/items/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"hidden\":true}")).andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/profile/items/" + id)).andExpect(status().isNotFound());
        mockMvc
            .perform(post("/api/profile/items/reorder").contentType(MediaType.APPLICATION_JSON).content("{\"section\":\"EXPERIENCE\",\"ids\":[" + id + "]}"))
            .andExpect(status().isNotFound());
        assertThat(ids(list(""))).doesNotContain(id);
        ProfileItem untouched = itemRepository.findById(id).orElseThrow();
        assertThat(untouched.isHidden()).isFalse();
        assertThat(untouched.getDeletedAt()).isNull();
        mockMvc.perform(delete("/api/profile/items/999999999")).andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "nobody-at-all")
    void unknownUserIsRefused() throws Exception {
        mockMvc.perform(get("/api/profile/items")).andExpect(status().isUnauthorized());
    }

    // ---- reorder ------------------------------------------------------------------------------

    @Test
    void reorderPutsListedIdsFirstAndKeepsTheRest() throws Exception {
        long a = exp("A", "O").get("id").asLong();
        long b = exp("B", "O").get("id").asLong();
        long c = exp("C", "O").get("id").asLong();
        long edu = createItem("EDUCATION", "{\"school\":\"MIT\"}").get("id").asLong();

        mockMvc
            .perform(post("/api/profile/items/reorder").contentType(MediaType.APPLICATION_JSON).content("{\"section\":\"EXPERIENCE\",\"ids\":[" + c + "," + b + "," + a + "]}"))
            .andExpect(status().isNoContent());
        assertThat(ids(list("?section=EXPERIENCE"))).containsExactly(c, b, a);

        mockMvc // a partial list: listed first, the rest after in their existing order
            .perform(post("/api/profile/items/reorder").contentType(MediaType.APPLICATION_JSON).content("{\"section\":\"EXPERIENCE\",\"ids\":[" + a + "]}"))
            .andExpect(status().isNoContent());
        assertThat(ids(list("?section=EXPERIENCE"))).containsExactly(a, c, b);

        // an id from another section, a repeated id, a missing section
        mockMvc
            .perform(post("/api/profile/items/reorder").contentType(MediaType.APPLICATION_JSON).content("{\"section\":\"EXPERIENCE\",\"ids\":[" + edu + "]}"))
            .andExpect(status().isNotFound());
        mockMvc
            .perform(post("/api/profile/items/reorder").contentType(MediaType.APPLICATION_JSON).content("{\"section\":\"EXPERIENCE\",\"ids\":[" + a + "," + a + "]}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ITEM_INVALID"));
        mockMvc
            .perform(post("/api/profile/items/reorder").contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[]}"))
            .andExpect(status().isUnprocessableEntity());
        assertThat(ids(list("?section=EXPERIENCE"))).containsExactly(a, c, b); // refusals changed nothing
    }

    // ---- refusals -----------------------------------------------------------------------------

    @Test
    void invalidRequestsAre422WithACode() throws Exception {
        postItem("{\"dataJson\":{\"title\":\"x\"}}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("ITEM_INVALID"));
        postItem("{\"section\":\"EXPERIENCE\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("ITEM_INVALID"));
        postItem("{\"section\":\"EXPERIENCE\",\"dataJson\":[1,2]}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("dataJson"));
        postItem("{\"section\":\"EXPERIENCE\",\"dataJson\":\"not an object\"}").andExpect(status().isUnprocessableEntity());
        postItem("{\"section\":\"NOT_A_SECTION\",\"dataJson\":{}}").andExpect(status().isBadRequest());
        assertThat(list("")).isEmpty();
    }

    @Test
    void oversizedItemIs413() throws Exception {
        String big = "a".repeat(20_000);
        postItem("{\"section\":\"EXPERIENCE\",\"dataJson\":{\"title\":\"" + big + "\"}}")
            .andExpect(status().isPayloadTooLarge())
            .andExpect(jsonPath("$.code").value("ITEM_TOO_LARGE"));
        assertThat(list("")).isEmpty();
    }

    @Test
    void sensitiveValuesAreRefusedOnCreateAndUpdateAndNothingIsWritten() throws Exception {
        postItem("{\"section\":\"EXPERIENCE\",\"dataJson\":{\"title\":\"Engineer\",\"bullets\":[{\"text\":\"fine\"},{\"text\":\"My SSN is 123-45-6789\"}]}}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"))
            .andExpect(jsonPath("$.path").value("dataJson.bullets[1].text"))
            .andExpect(jsonPath("$.class").value("SSN_ITIN"));
        assertThat(list("")).isEmpty();

        long id = exp("Engineer", "Acme").get("id").asLong();
        mockMvc
            .perform(put("/api/profile/items/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"dataJson\":{\"title\":\"Engineer\",\"summary\":\"Date of birth: 1990-05-12\"}}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"))
            .andExpect(jsonPath("$.class").value("DOB"))
            .andExpect(jsonPath("$.path").value("dataJson.summary"));
        assertThat(list("").get(0).get("data").get("title").asText()).isEqualTo("Engineer"); // unchanged
        assertThat(list("").get(0).get("data").has("summary")).isFalse();

        // the key is the label: {"passportNumber": "A12345678"}
        postItem("{\"section\":\"CUSTOM\",\"dataJson\":{\"title\":\"ID\",\"passportNumber\":\"A12345678\"}}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.class").value("PASSPORT"));
    }

    // ---- seeding from the default resume ------------------------------------------------------

    @Test
    void firstListSeedsFromTheDefaultResumeOnceAndRedacts() throws Exception {
        Resume r = saveResume(true, PARSED);
        assertThat(bioRow()).isNull();

        JsonNode first = list("");
        assertThat(first).hasSize(4); // experience, education, project, one skills row (no languages)
        JsonNode experience = null;
        for (JsonNode n : first) if (n.get("section").asText().equals("EXPERIENCE")) experience = n;
        assertThat(experience).isNotNull();
        assertThat(experience.get("provenance").asText()).isEqualTo("PARSED");
        assertThat(experience.get("sourceResumeId").asLong()).isEqualTo(r.getId());
        assertThat(experience.get("data").get("org").asText()).isEqualTo("Acme Inc");
        assertThat(experience.get("data").get("start").asText()).isEqualTo("2020-01");
        assertThat(experience.get("data").get("current").asBoolean()).isTrue();
        // the date of birth stored in the old resume text was removed, not imported
        assertThat(experience.get("data").get("bullets").get(1).get("text").asText()).isEqualTo("Born [removed] in Ohio");

        assertThat(meta().get("seededFromResumeId").asLong()).isEqualTo(r.getId());
        assertThat(bioRow().getPayload()).isEqualTo("{}"); // a marker row, no profile values

        // idempotent; and a deleted item does not come back
        long gone = experience.get("id").asLong();
        assertThat(list("")).hasSize(4);
        mockMvc.perform(delete("/api/profile/items/" + gone)).andExpect(status().isNoContent());
        assertThat(list("")).hasSize(3);
        assertThat(ids(list(""))).doesNotContain(gone);
    }

    @Test
    void noDefaultResumeMeansNoSeedAndNoBioRow() throws Exception {
        saveResume(false, PARSED);
        assertThat(list("")).isEmpty();
        assertThat(bioRow()).isNull();
        mockMvc.perform(get("/api/profile")).andExpect(status().isNotFound());
    }

    @Test
    void seedingMergesWithItemsThatExistedBeforeAResumeDid() throws Exception {
        // an import with no default resume yet (and no source resume) leaves the profile unseeded ...
        importItems("{\"items\":[{\"section\":\"EXPERIENCE\",\"dataJson\":{\"title\":\"engineer\",\"org\":\"ACME\",\"bullets\":[{\"text\":\"Mine\"}]},\"provenance\":\"USER\"}]}")
            .andExpect(status().isOk());
        assertThat(bioRow()).isNull();
        // ... so when the first resume arrives, seeding merges into the user's own item instead of duplicating it
        saveResume(true, PARSED);
        JsonNode items = list("?section=EXPERIENCE");
        assertThat(items).hasSize(1);
        assertThat(items.get(0).get("provenance").asText()).isEqualTo("USER");
        assertThat(items.get(0).get("data").get("bullets")).hasSize(3); // Mine + the two parsed bullets
        assertThat(items.get(0).get("data").get("title").asText()).isEqualTo("engineer");
    }

    @Test
    void aBrokenParsedJsonSeedsNothingButStillMarks() throws Exception {
        saveResume(true, "not json at all");
        assertThat(list("")).isEmpty();
        assertThat(meta().has("seededFromResumeId")).isTrue();
    }

    // ---- import -------------------------------------------------------------------------------

    @Test
    void importCreatesThenMergesWithoutDuplicates() throws Exception {
        String body =
            "{\"items\":[" +
            "{\"section\":\"EXPERIENCE\",\"dataJson\":{\"title\":\"Engineer\",\"org\":\"Acme Inc.\",\"bullets\":[{\"text\":\"Built it\"}]},\"provenance\":\"PARSED\"}," +
            "{\"section\":\"EDUCATION\",\"dataJson\":{\"school\":\"MIT\",\"degree\":\"BS\"}}," +
            "{\"section\":\"SKILL\",\"dataJson\":{\"group\":\"Skills\",\"skills\":[\"Java\",\"SQL\"]}}" +
            "]}";
        importItems(body)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.created").value(3))
            .andExpect(jsonPath("$.merged").value(0))
            .andExpect(jsonPath("$.updatedBio").value(false));
        assertThat(list("")).hasSize(3);

        String second =
            "{\"items\":[" +
            "{\"section\":\"EXPERIENCE\",\"dataJson\":{\"title\":\" engineer\",\"company\":\"ACME\",\"location\":\"NYC\",\"bullets\":[{\"text\":\"Built it\"},{\"text\":\"Shipped it\"}]}}," +
            "{\"section\":\"EXPERIENCE\",\"dataJson\":{\"title\":\"Manager\",\"org\":\"Globex\"}}," +
            "{\"section\":\"SKILL\",\"dataJson\":{\"group\":\"skills\",\"skills\":[\"sql\",\"Go\"]}}" +
            "]}";
        importItems(second)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.created").value(1))
            .andExpect(jsonPath("$.merged").value(2));
        JsonNode items = list("");
        assertThat(items).hasSize(4);
        JsonNode acme = list("?section=EXPERIENCE").get(0);
        assertThat(acme.get("data").get("bullets")).hasSize(2);
        assertThat(acme.get("data").get("location").asText()).isEqualTo("NYC");
        assertThat(acme.get("data").get("org").asText()).isEqualTo("Acme Inc."); // existing data wins
        assertThat(list("?section=SKILL").get(0).get("data").get("skills")).hasSize(3);

        importItems(second).andExpect(jsonPath("$.created").value(0)); // re-import: nothing new
        assertThat(list("")).hasSize(4);
    }

    @Test
    void importWritesBioValuesWithProvenanceAndIgnoresOtherKeys() throws Exception {
        putBio(Map.of("firstName", "Ada", "gender", "Female"));
        importItems(
            "{\"items\":[],\"bio\":{\"firstName\":\"Ada\",\"lastName\":\"Lovelace\",\"email\":\"ada@example.com\",\"headline\":\"Engineer\",\"gender\":\"Male\",\"onboardedAt\":\"x\"},\"provenanceBio\":\"parsed\"}"
        )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.updatedBio").value(true));
        JsonNode payload = json(bioRow().getPayload());
        assertThat(payload.get("lastName").asText()).isEqualTo("Lovelace");
        assertThat(payload.get("headline").asText()).isEqualTo("Engineer");
        assertThat(payload.get("gender").asText()).isEqualTo("Female"); // not an importable key
        assertThat(payload.has("onboardedAt")).isFalse();
        JsonNode prov = meta().get("provenance");
        assertThat(prov.get("lastName").asText()).isEqualTo("parsed");
        assertThat(prov.get("firstName").asText()).isEqualTo("user"); // unchanged value keeps its earlier stamp
        assertThat(prov.has("gender")).isTrue();

        importItems("{\"items\":[],\"bio\":{\"lastName\":\"Lovelace\"}}").andExpect(jsonPath("$.updatedBio").value(false));
    }

    @Test
    void importIsAtomicAndRefusesNeverCollectedValuesNamingTheItem() throws Exception {
        putBio(Map.of("firstName", "Ada"));
        importItems(
            "{\"items\":[{\"section\":\"EXPERIENCE\",\"dataJson\":{\"title\":\"Fine\"}},{\"section\":\"PROJECT\",\"dataJson\":{\"title\":\"P\",\"bullets\":[{\"text\":\"EIN 12-3456789\"}]}}],\"bio\":{\"lastName\":\"Lovelace\"}}"
        )
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"))
            .andExpect(jsonPath("$.path").value("items[1].dataJson.bullets[0].text"))
            .andExpect(jsonPath("$.class").value("TAX_ID"));
        assertThat(list("")).isEmpty();
        assertThat(json(bioRow().getPayload()).has("lastName")).isFalse();

        importItems("{\"items\":[],\"bio\":{\"phone\":\"SSN 123-45-6789\"}}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.path").value("bio.phone"));
        importItems("{\"items\":[],\"bio\":{\"summary\":\"" + "x".repeat(2001) + "\"}}").andExpect(status().isUnprocessableEntity());
        importItems("{\"items\":[{\"dataJson\":{}}]}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("items[0].section"));
    }

    @Test
    void importCountsAsSeedingSoTheDefaultResumeIsNotCopiedLater() throws Exception {
        Resume r = saveResume(true, PARSED);
        importItems("{\"items\":[{\"section\":\"EXPERIENCE\",\"dataJson\":{\"title\":\"Kept\",\"org\":\"One\"}}]}").andExpect(status().isOk());
        assertThat(meta().get("seededFromResumeId").asLong()).isEqualTo(r.getId());
        JsonNode items = list("");
        assertThat(items).hasSize(1); // the cards the user skipped did not reappear
        assertThat(items.get(0).get("data").get("title").asText()).isEqualTo("Kept");
    }

    @Test
    void importOnlyKeepsASourceResumeTheUserOwns() throws Exception {
        Resume mine = saveResume(false, PARSED);
        User other = userRepository.findOneByLogin("admin").orElseThrow();
        Resume theirs = new Resume().label("Theirs").r2ObjectKey("").status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        theirs.setUser(other);
        theirs = resumeRepository.saveAndFlush(theirs);
        importItems(
            "{\"items\":[{\"section\":\"EXPERIENCE\",\"dataJson\":{\"title\":\"A\",\"org\":\"X\"},\"sourceResumeId\":" + mine.getId() + "}," +
            "{\"section\":\"EXPERIENCE\",\"dataJson\":{\"title\":\"B\",\"org\":\"Y\"},\"sourceResumeId\":" + theirs.getId() + "}]}"
        ).andExpect(status().isOk());
        JsonNode items = list("?section=EXPERIENCE");
        assertThat(items.get(0).get("sourceResumeId").asLong()).isEqualTo(mine.getId());
        assertThat(items.get(1).path("sourceResumeId").asLong()).isZero(); // null (or absent): not theirs to claim
    }

    @Test
    void theItemSizeLimitComesFromTheSetting() throws Exception {
        String twoKb = "a".repeat(2_000);
        createItem("EXPERIENCE", "{\"title\":\"" + twoKb + "\"}"); // default 16 KB: fine
        setting(ResumeBuilderSettingKeys.PROFILE_ITEM_MAX_BYTES, "1024");
        postItem("{\"section\":\"EXPERIENCE\",\"dataJson\":{\"title\":\"" + twoKb + "\"}}")
            .andExpect(status().isPayloadTooLarge())
            .andExpect(jsonPath("$.code").value("ITEM_TOO_LARGE"))
            .andExpect(jsonPath("$.maxBytes").value(1024));
    }

    @Test
    void theLiveItemCapComesFromTheSetting() throws Exception {
        setting(ResumeBuilderSettingKeys.PROFILE_ITEMS_MAX_PER_USER, "50");
        for (int i = 0; i < 50; i++) createItem("CUSTOM", "{\"title\":\"c" + i + "\"}");
        postItem("{\"section\":\"CUSTOM\",\"dataJson\":{\"title\":\"one too many\"}}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ITEM_LIMIT"))
            .andExpect(jsonPath("$.limit").value(50));
        assertThat(list("")).hasSize(50);
    }

    @Test
    void theImportSizeLimitComesFromTheSetting() throws Exception {
        setting(ResumeBuilderSettingKeys.PROFILE_IMPORT_MAX_ITEMS, "10");
        importItems(customItems(10)).andExpect(status().isOk());
        importItems(customItems(11))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ITEM_LIMIT"))
            .andExpect(jsonPath("$.limit").value(10));
    }

    @Test
    void theBioValueCapsComeFromTheSettings() throws Exception {
        setting(ResumeBuilderSettingKeys.PROFILE_BIO_VALUE_MAX_CHARS, "50");
        setting(ResumeBuilderSettingKeys.PROFILE_BIO_SUMMARY_MAX_CHARS, "200");
        importItems("{\"items\":[],\"bio\":{\"headline\":\"" + "x".repeat(50) + "\",\"summary\":\"" + "y".repeat(200) + "\"}}").andExpect(status().isOk());
        importItems("{\"items\":[],\"bio\":{\"headline\":\"" + "x".repeat(51) + "\"}}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.path").value("bio.headline"));
        importItems("{\"items\":[],\"bio\":{\"summary\":\"" + "y".repeat(201) + "\"}}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.path").value("bio.summary"));
    }

    @Test
    void importLimits() throws Exception {
        StringBuilder sb = new StringBuilder("{\"items\":[");
        for (int i = 0; i < 201; i++) sb.append(i == 0 ? "" : ",").append("{\"section\":\"CUSTOM\",\"dataJson\":{\"title\":\"t").append(i).append("\"}}");
        sb.append("]}");
        importItems(sb.toString()).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("ITEM_LIMIT"));
    }

    // ---- provenance on bio writes ---------------------------------------------------------------

    @Test
    void putProfileStampsChangedKeysAsUser() throws Exception {
        putBio(Map.of("firstName", "Ada", "city", "London"));
        assertThat(meta().get("provenance").get("firstName").asText()).isEqualTo("user");
        assertThat(meta().get("provenance").get("city").asText()).isEqualTo("user");

        importItems("{\"items\":[],\"bio\":{\"city\":\"Paris\"},\"provenanceBio\":\"parsed\"}").andExpect(status().isOk());
        assertThat(meta().get("provenance").get("city").asText()).isEqualTo("parsed");

        putBio(Map.of("firstName", "Ada", "city", "Paris", "country", "FR")); // only country is new
        assertThat(meta().get("provenance").get("city").asText()).isEqualTo("parsed"); // unchanged: not re-stamped
        assertThat(meta().get("provenance").get("country").asText()).isEqualTo("user");

        putBio(Map.of("firstName", "Ada", "country", "FR")); // city removed
        assertThat(meta().get("provenance").has("city")).isFalse();
    }

    @Test
    void acceptingASuggestionStampsLearned() throws Exception {
        putBio(Map.of("firstName", "Ada"));
        mockMvc
            .perform(post("/api/profile/suggestions").contentType(MediaType.APPLICATION_JSON).content("[{\"fieldKey\":\"referralSource\",\"value\":\"LinkedIn\",\"context\":\"app1\"}]"))
            .andExpect(status().isNoContent());
        String body = mockMvc.perform(get("/api/profile/suggestions")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long id = json(body).get(0).get("id").asLong();
        mockMvc.perform(post("/api/profile/suggestions/" + id + "/accept")).andExpect(status().isNoContent());
        assertThat(meta().get("provenance").get("referralSource").asText()).isEqualTo("learned");
        assertThat(meta().get("provenance").get("firstName").asText()).isEqualTo("user");
    }

    // ---- completeness -------------------------------------------------------------------------

    @Test
    void completenessMathAndNextAction() throws Exception {
        mockMvc
            .perform(get("/api/profile/completeness"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.score").value(0))
            .andExpect(jsonPath("$.nextAction.key").value("experience"))
            .andExpect(jsonPath("$.nextAction.href").value("/profiles?tab=work"))
            .andExpect(jsonPath("$.parts.experience.weight").value(25))
            .andExpect(jsonPath("$.parts.experience.done").value(false));

        createItem("EXPERIENCE", "{\"title\":\"Engineer\",\"org\":\"Acme\",\"bullets\":[{\"text\":\"a\"},{\"text\":\"b\"}]}");
        createItem("EDUCATION", "{\"school\":\"MIT\"}");
        createItem("SKILL", "{\"group\":\"Skills\",\"skills\":[\"a\",\"b\",\"c\",\"d\",\"e\"]}");
        putBio(Map.of("firstName", "Ada", "lastName", "L", "email", "a@b.c", "phone", "1", "headline", "Eng"));
        // 25 + 10 + 15 + 15 + 5
        mockMvc
            .perform(get("/api/profile/completeness"))
            .andExpect(jsonPath("$.score").value(70))
            .andExpect(jsonPath("$.parts.identity.done").value(true))
            .andExpect(jsonPath("$.nextAction.key").value("summary"));
    }

    @Test
    void completenessIsCachedInMetaOnEveryWriteWithoutMovingTheProfileVersion() throws Exception {
        putBio(Map.of("firstName", "Ada"));
        assertThat(meta().get("completeness").get("score").asInt()).isZero();
        String before = version();
        Instant updatedBefore = bioRow().getUpdatedAt();

        createItem("EDUCATION", "{\"school\":\"MIT\"}");
        assertThat(meta().get("completeness").get("score").asInt()).isEqualTo(10);
        assertThat(meta().get("completeness").get("nextAction").get("key").asText()).isEqualTo("experience");
        assertThat(meta().get("completeness").has("computedAt")).isTrue();

        long id = list("").get(0).get("id").asLong();
        mockMvc.perform(delete("/api/profile/items/" + id)).andExpect(status().isNoContent());
        assertThat(meta().get("completeness").get("score").asInt()).isZero();

        // the extension's profile version and the bio the extension pulls are untouched by item writes
        assertThat(version()).isEqualTo(before);
        assertThat(bioRow().getUpdatedAt()).isEqualTo(updatedBefore);

        putBio(Map.of("firstName", "Ada", "lastName", "L", "email", "a@b.c", "phone", "1"));
        assertThat(meta().get("completeness").get("score").asInt()).isEqualTo(15);
        assertThat(version()).isNotEqualTo(before); // a real bio change still moves it
    }

    @Test
    void metaJsonNeverReachesTheExtension() throws Exception {
        putBio(Map.of("firstName", "Ada"));
        String body = mockMvc.perform(get("/api/profile")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(json(body).has("metaJson")).isFalse();
        assertThat(body).doesNotContain("provenance").doesNotContain("completeness");
        JsonNode payload = json(json(body).get("payload").asText());
        assertThat(payload.size()).isEqualTo(1); // the payload is exactly what was written
    }
}
