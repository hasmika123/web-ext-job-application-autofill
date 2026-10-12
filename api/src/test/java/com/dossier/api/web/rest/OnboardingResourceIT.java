package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.OnboardingDraft;
import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.domain.enumeration.Provenance;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.OnboardingDraftRepository;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.onboarding.OnboardingDraftPurgeJob;
import com.dossier.api.service.resume.ProfileMeta;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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
 * Integration tests for {@link OnboardingResource} (Onboarding v2 R1.8): the status for a new / drafting / finished user, the
 * draft's upsert with its 409 / 413 / 422 refusals (and that a refusal stores nothing), start over, the persona and card
 * markers, finish (idempotent, writes {@code onboardedAt}, deletes the draft, counts the coverage), the demo guard, ownership by
 * login, and that no draft or marker write moves the extension's profile version.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class OnboardingResourceIT {

    private static final String URL = "/api/profile/onboarding";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private BioRepository bioRepository;

    @Autowired
    private ProfileItemRepository itemRepository;

    @Autowired
    private OnboardingDraftRepository draftRepository;

    @Autowired
    private AppSettingRepository appSettingRepository;

    @Autowired
    private ResumeBuilderSettings settings;

    @Autowired
    private jakarta.persistence.EntityManager em;

    @Autowired
    private OnboardingDraftPurgeJob purgeJob;

    @AfterEach
    void dropSettingsCache() {
        settings.invalidate(); // the setting rows roll back with the test transaction; the cache must not outlive them
    }

    // ---- helpers ------------------------------------------------------------

    private User me() {
        return userRepository.findOneByLogin("user").orElseThrow();
    }

    private void setting(String key, String value) {
        appSettingRepository.saveAndFlush(new AppSetting(key, value, "it", Instant.now()));
        settings.invalidate();
    }

    private static String draftBody(String step, String persona, String state, String base, boolean force) {
        return (
            "{\"v\":2,\"step\":\"" + step + "\"," +
            (persona == null ? "" : "\"persona\":\"" + persona + "\",") +
            "\"stepsDone\":2,\"stepsTotal\":7,\"state\":" + state +
            (base == null ? "" : ",\"baseUpdatedAt\":\"" + base + "\"") +
            (force ? ",\"force\":true" : "") + "}"
        );
    }

    private ResultActions putDraft(String body) throws Exception {
        return mockMvc.perform(put(URL + "/draft").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private JsonNode saveDraft(String step, String state) throws Exception {
        String res = putDraft(draftBody(step, null, state, null, false)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return om.readTree(res);
    }

    private JsonNode getStatus(String query) throws Exception {
        return om.readTree(mockMvc.perform(get(URL + query)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode patchBody(String body) throws Exception {
        return om.readTree(
            mockMvc.perform(patch(URL).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()
        );
    }

    private void putBio(String payloadJson) throws Exception {
        mockMvc
            .perform(put("/api/profile").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(java.util.Map.of("payload", payloadJson))))
            .andExpect(status().isOk());
    }

    private String version() throws Exception {
        return om.readTree(mockMvc.perform(get("/api/profile/version")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("version").asText();
    }

    private Bio bio() {
        return bioRepository.findByUserId(me().getId()).stream().findFirst().orElse(null);
    }

    // ---- status -------------------------------------------------------------

    @Test
    void aNewUserIsNoneWithAShownNotStartedCard() throws Exception {
        mockMvc
            .perform(get(URL))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("NONE"))
            .andExpect(jsonPath("$.persona").doesNotExist())
            .andExpect(jsonPath("$.draft").doesNotExist())
            .andExpect(jsonPath("$.card.show").value(true))
            .andExpect(jsonPath("$.card.state").value("NOT_STARTED"))
            .andExpect(jsonPath("$.card.resurfaceCount").value(0))
            .andExpect(jsonPath("$.completeness.score").isNumber())
            .andExpect(jsonPath("$.completeness.promptBelow").value(40))
            .andExpect(jsonPath("$.completeness.resurfaceBelow").value(20));
    }

    @Test
    void theEndpointsNeedASignedInUser() throws Exception {
        mockMvc.perform(get(URL).with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous())).andExpect(status().isUnauthorized());
    }

    // ---- the draft ----------------------------------------------------------

    @Test
    void aSavedDraftComesBackAsDraftWithItsStateOnlyWhenAsked() throws Exception {
        JsonNode saved = saveDraft("review", "{\"cursor\":3,\"cards\":[{\"id\":\"a\"}]}");
        assertThat(saved.path("updatedAt").asText()).isNotBlank();
        Instant updated = Instant.parse(saved.path("updatedAt").asText());
        assertThat(Instant.parse(saved.path("expiresAt").asText())).isEqualTo(updated.plus(Duration.ofDays(30)));

        JsonNode plain = getStatus("");
        assertThat(plain.path("status").asText()).isEqualTo("DRAFT");
        assertThat(plain.at("/draft/step").asText()).isEqualTo("review");
        assertThat(plain.at("/draft/stepsDone").asInt()).isEqualTo(2);
        assertThat(plain.at("/draft/stepsTotal").asInt()).isEqualTo(7);
        assertThat(plain.at("/draft/updatedAt").asText()).isEqualTo(saved.path("updatedAt").asText());
        assertThat(plain.at("/draft/state").isMissingNode()).isTrue();
        assertThat(plain.at("/card/state").asText()).isEqualTo("IN_PROGRESS");

        JsonNode withState = getStatus("?include=state");
        assertThat(withState.at("/draft/state/cursor").asInt()).isEqualTo(3);
        assertThat(withState.at("/draft/state/cards/0/id").asText()).isEqualTo("a");
    }

    @Test
    void anotherDeviceWritingFirstIsA409AndForceKeepsMine() throws Exception {
        JsonNode first = saveDraft("source", "{\"n\":1}");
        String base = first.path("updatedAt").asText();
        Thread.sleep(5);
        putDraft(draftBody("source", null, "{\"n\":2}", base, false)).andExpect(status().isOk()); // the other device

        putDraft(draftBody("source", null, "{\"n\":3}", base, false))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("DRAFT_CONFLICT"))
            .andExpect(jsonPath("$.serverUpdatedAt").isString());
        assertThat(getStatus("?include=state").at("/draft/state/n").asInt()).as("a conflict stores nothing").isEqualTo(2);

        putDraft(draftBody("source", null, "{\"n\":3}", base, true)).andExpect(status().isOk());
        assertThat(getStatus("?include=state").at("/draft/state/n").asInt()).isEqualTo(3);
    }

    @Test
    void noBaseWhileADraftExistsIsAConflictToo() throws Exception {
        saveDraft("source", "{\"n\":1}");
        putDraft(draftBody("source", null, "{\"n\":2}", null, false)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DRAFT_CONFLICT"));
    }

    @Test
    void aDraftOverTheConfiguredCapIs413() throws Exception {
        setting("onboarding.draft.maxBytes", "65536");
        String big = "{\"x\":\"" + "a".repeat(70_000) + "\"}";

        putDraft(draftBody("source", null, big, null, false))
            .andExpect(status().isPayloadTooLarge())
            .andExpect(jsonPath("$.code").value("DRAFT_TOO_LARGE"))
            .andExpect(jsonPath("$.max").value(65536));
        assertThat(getStatus("").path("status").asText()).isEqualTo("NONE");
    }

    @Test
    void aNeverCollectedValueIsRefusedAndNothingIsStored() throws Exception {
        putDraft(draftBody("source", null, "{\"parsed\":{\"headline\":\"Routing number: 021000021\"}}", null, false))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"))
            .andExpect(jsonPath("$.path").value("state.parsed.headline"))
            .andExpect(jsonPath("$.class").value("ROUTING"));
        assertThat(draftRepository.findByUserId(me().getId())).isEmpty();
        assertThat(getStatus("").path("status").asText()).isEqualTo("NONE");
    }

    @Test
    void anUnknownStepVersionOrStateIs422DraftInvalid() throws Exception {
        putDraft(draftBody("lobby", null, "{}", null, false))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("DRAFT_INVALID"))
            .andExpect(jsonPath("$.path").value("step"));
        putDraft("{\"v\":1,\"step\":\"source\",\"stepsDone\":1,\"stepsTotal\":7,\"state\":{}}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.path").value("v"));
        putDraft("{\"v\":2,\"step\":\"source\",\"stepsDone\":1,\"stepsTotal\":7,\"state\":[1]}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.path").value("state"));
        putDraft(draftBody("source", "wizard", "{}", null, false))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.path").value("persona"));
        assertThat(draftRepository.findByUserId(me().getId())).isEmpty();
    }

    @Test
    void startOverDeletesTheDraftAndKeepsThePersona() throws Exception {
        putDraft(draftBody("hello", "student", "{\"n\":1}", null, false)).andExpect(status().isOk());
        mockMvc.perform(delete(URL + "/draft")).andExpect(status().isNoContent());

        JsonNode s = getStatus("");
        assertThat(s.path("status").asText()).isEqualTo("NONE");
        assertThat(s.path("persona").asText()).isEqualTo("student");
        mockMvc.perform(delete(URL + "/draft")).andExpect(status().isNoContent()); // nothing to delete is fine
    }

    @Test
    void anExpiredDraftIsGoneForTheUserAndThePurgeJobDeletesIt() throws Exception {
        saveDraft("source", "{\"n\":1}");
        OnboardingDraft row = draftRepository.findByUserId(me().getId()).orElseThrow();
        row.setExpiresAt(Instant.now().minus(1, ChronoUnit.DAYS));
        draftRepository.saveAndFlush(row);

        assertThat(getStatus("").path("status").asText()).isEqualTo("NONE");
        assertThat(purgeJob.purge(Instant.now())).isGreaterThanOrEqualTo(1);
        assertThat(draftRepository.findByUserId(me().getId())).isEmpty();
    }

    // ---- persona and card ---------------------------------------------------

    @Test
    void thePersonaIsSetClearedAndValidated() throws Exception {
        assertThat(patchBody("{\"persona\":\"switching\"}").path("persona").asText()).isEqualTo("switching");
        assertThat(getStatus("").path("persona").asText()).isEqualTo("switching");
        assertThat(patchBody("{}").path("persona").asText()).as("absent leaves it").isEqualTo("switching");
        assertThat(patchBody("{\"persona\":null}").path("persona").isNull()).isTrue();

        mockMvc
            .perform(patch(URL).contentType(MediaType.APPLICATION_JSON).content("{\"persona\":\"wizard\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("PERSONA_INVALID"));
        mockMvc
            .perform(patch(URL).contentType(MediaType.APPLICATION_JSON).content("{\"persona\":7}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("PERSONA_INVALID"));
    }

    @Test
    void thePersonaLivesInTheMetaNotInThePayload() throws Exception {
        putBio("{\"firstName\":\"Ada\"}");
        patchBody("{\"persona\":\"student\"}");

        Bio bio = bio();
        assertThat(om.readTree(bio.getPayload()).has("persona")).isFalse();
        assertThat(ProfileMeta.onboarding(ProfileMeta.read(bio.getMetaJson())).persona()).isEqualTo("student");
    }

    @Test
    void snoozeDismissAndResetDriveTheCard() throws Exception {
        JsonNode snoozed = patchBody("{\"card\":{\"action\":\"SNOOZE\"}}");
        assertThat(snoozed.at("/card/show").asBoolean()).isFalse();
        Instant until = Instant.parse(snoozed.at("/card/snoozedUntil").asText());
        assertThat(Duration.between(Instant.now(), until).toDays()).isBetween(2L, 3L);

        JsonNode dismissed = patchBody("{\"card\":{\"action\":\"DISMISS\"}}");
        assertThat(dismissed.at("/card/show").asBoolean()).isFalse();
        assertThat(dismissed.at("/card/dismissedAt").isNull()).isFalse();
        assertThat(dismissed.at("/card/snoozedUntil").isNull()).isTrue();

        JsonNode reset = patchBody("{\"card\":{\"action\":\"RESET\"}}");
        assertThat(reset.at("/card/show").asBoolean()).isTrue();
        assertThat(reset.at("/card/dismissedAt").isNull()).isTrue();

        mockMvc
            .perform(patch(URL).contentType(MediaType.APPLICATION_JSON).content("{\"card\":{\"action\":\"FLY\"}}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("DRAFT_INVALID"));
    }

    @Test
    void aDismissedCardResurfacesWhenThinAndIsCountedOncePerShowing() throws Exception {
        patchBody("{\"card\":{\"action\":\"DISMISS\"}}");
        Bio bio = bio();
        com.fasterxml.jackson.databind.node.ObjectNode meta = ProfileMeta.read(bio.getMetaJson());
        ProfileMeta.putOnboarding(
            meta,
            ProfileMeta.onboarding(meta).withCard(new ProfileMeta.OnboardingCard(Instant.now().minus(20, ChronoUnit.DAYS), null, 0, null))
        );
        bio.setMetaJson(ProfileMeta.write(meta));
        bioRepository.saveAndFlush(bio);

        JsonNode first = getStatus("");
        assertThat(first.at("/card/show").asBoolean()).isTrue();
        assertThat(first.at("/card/resurfaced").asBoolean()).isTrue();
        assertThat(first.at("/card/resurfaceCount").asInt()).isEqualTo(1);
        assertThat(getStatus("").at("/card/resurfaceCount").asInt()).as("the same showing").isEqualTo(1);
        assertThat(getStatus("").at("/card/show").asBoolean()).isTrue();
    }

    @Test
    void theFeatureSwitchHidesTheCard() throws Exception {
        setting("feature.onboarding_v2.enabled", "false");
        assertThat(getStatus("").at("/card/show").asBoolean()).isFalse();
    }

    // ---- finish -------------------------------------------------------------

    @Test
    void finishWritesTheMarkersDeletesTheDraftAndCountsTheFieldsHonestly() throws Exception {
        putBio("{\"firstName\":\"Ada\",\"lastName\":\"Lovelace\",\"email\":\"ada@example.com\",\"phone\":\"\"}");
        ProfileItem exp = new ProfileItem();
        exp.setUser(me());
        exp.setSection(ProfileSection.EXPERIENCE);
        exp.setDataJson("{\"title\":\"Engineer\",\"company\":\"Analytical Engines\"}");
        exp.setProvenance(Provenance.USER);
        itemRepository.saveAndFlush(exp);
        putDraft(draftBody("prefs", "experienced", "{\"n\":1}", null, false)).andExpect(status().isOk());

        JsonNode f = om.readTree(mockMvc.perform(post(URL + "/finish")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());

        assertThat(f.path("finishedAt").asText()).isNotBlank();
        assertThat(f.at("/completeness/score").isNumber()).isTrue();
        assertThat(f.at("/coverage/fields").asInt()).as("first, last, fullName, email + one job").isEqualTo(4 + 5);
        assertThat(f.at("/coverage/groups/contact").asInt()).isEqualTo(4);
        assertThat(f.at("/coverage/groups/work").asInt()).isEqualTo(5);
        assertThat(draftRepository.findByUserId(me().getId())).isEmpty();

        Bio bio = bio();
        assertThat(om.readTree(bio.getPayload()).path("onboardedAt").asText()).isEqualTo(f.path("finishedAt").asText());
        assertThat(om.readTree(bio.getPayload()).path("firstName").asText()).isEqualTo("Ada");
        ProfileMeta.OnboardingMeta o = ProfileMeta.onboarding(ProfileMeta.read(bio.getMetaJson()));
        assertThat(o.finishedAt()).isEqualTo(Instant.parse(f.path("finishedAt").asText()));
        assertThat(o.persona()).isEqualTo("experienced");

        JsonNode s = getStatus("");
        assertThat(s.path("status").asText()).isEqualTo("FINISHED");
        assertThat(s.path("finishedAt").asText()).isEqualTo(f.path("finishedAt").asText());
        assertThat(s.path("draft").isNull()).isTrue();
    }

    @Test
    void finishIsIdempotent() throws Exception {
        putBio("{\"firstName\":\"Ada\"}");
        String first = mockMvc.perform(post(URL + "/finish")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String payload = bio().getPayload();
        String second = mockMvc.perform(post(URL + "/finish")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertThat(om.readTree(second)).isEqualTo(om.readTree(first));
        assertThat(bio().getPayload()).isEqualTo(payload);
    }

    @Test
    void anExistingOnboardedAtFlagReadsAsFinishedWithoutABackfill() throws Exception {
        putBio("{\"onboardedAt\":\"2026-09-01T08:00:00.000Z\"}");
        JsonNode s = getStatus("");
        assertThat(s.path("status").asText()).isEqualTo("FINISHED");
        assertThat(s.path("finishedAt").asText()).isEqualTo("2026-09-01T08:00:00Z");
        assertThat(ProfileMeta.onboarding(ProfileMeta.read(bio().getMetaJson())).finishedAt()).as("read-through only, nothing was backfilled").isNull();
    }

    // ---- ownership, demo, version -------------------------------------------

    @Test
    void anotherUsersStatusIsNoneAfterMyDraft() throws Exception {
        saveDraft("review", "{\"n\":1}");

        String other = mockMvc.perform(get(URL).with(user("admin"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(om.readTree(other).path("status").asText()).isEqualTo("NONE");
        assertThat(om.readTree(other).path("draft").isNull()).isTrue();
        assertThat(getStatus("").path("status").asText()).isEqualTo("DRAFT");
    }

    @Test
    void demoLoginsCannotWrite() throws Exception {
        for (var request : java.util.List.of(
            put(URL + "/draft").contentType(MediaType.APPLICATION_JSON).content(draftBody("source", null, "{}", null, false)),
            delete(URL + "/draft"),
            patch(URL).contentType(MediaType.APPLICATION_JSON).content("{\"persona\":\"student\"}"),
            post(URL + "/finish")
        )) {
            mockMvc.perform(request.with(user("demo"))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        }
    }

    @Test
    void noDraftOrMarkerWriteMovesTheExtensionsProfileVersion() throws Exception {
        putBio("{\"firstName\":\"Ada\",\"lastName\":\"Lovelace\"}");
        // The test shares one persistence context across requests, so a clear (the delete below) would reload the bio with the
        // database's microsecond precision; start from the reloaded row, as every real request does.
        em.flush();
        em.clear();
        String before = version();

        saveDraft("hello", "{\"n\":1}");
        putDraft(draftBody("hello", "student", "{\"n\":2}", getStatus("").at("/draft/updatedAt").asText(), false)).andExpect(status().isOk());
        patchBody("{\"persona\":\"first_job\"}");
        patchBody("{\"card\":{\"action\":\"SNOOZE\"}}");
        patchBody("{\"card\":{\"action\":\"DISMISS\"}}");
        patchBody("{\"card\":{\"action\":\"RESET\"}}");
        getStatus("?include=state");
        mockMvc.perform(delete(URL + "/draft")).andExpect(status().isNoContent());

        assertThat(version()).as("the mirror moves only on confirms").isEqualTo(before);
    }

    @Test
    void aDraftWithoutAPersonaDoesNotCreateABioRow() throws Exception {
        saveDraft("source", "{\"n\":1}");
        assertThat(bio()).isNull();
    }
}
