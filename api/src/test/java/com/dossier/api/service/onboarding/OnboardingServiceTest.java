package com.dossier.api.service.onboarding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Bio;
import com.dossier.api.domain.OnboardingDraft;
import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.OnboardingDraftRepository;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.DemoAccountService;
import com.dossier.api.service.ProfileItemService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.dto.OnboardingDTOs.CardPatch;
import com.dossier.api.service.dto.OnboardingDTOs.DraftRequest;
import com.dossier.api.service.dto.OnboardingDTOs.DraftSavedDTO;
import com.dossier.api.service.dto.OnboardingDTOs.FinishDTO;
import com.dossier.api.service.dto.OnboardingDTOs.PatchRequest;
import com.dossier.api.service.dto.OnboardingDTOs.Status;
import com.dossier.api.service.dto.OnboardingDTOs.StatusDTO;
import com.dossier.api.service.privacy.SensitiveContentException;
import com.dossier.api.service.resume.ProfileMeta;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * {@link OnboardingService} over in-memory stand-ins for the repositories (R1.8): the draft's upsert and TTL, the
 * 409 / 413 / 422 refusals and that a refusal writes nothing, the persona and card markers, "once per showing", the
 * read-through FINISHED from {@code onboardedAt}, idempotent finish, and that a draft write never touches the bio payload.
 * (The same paths over HTTP and a real database are in {@code OnboardingResourceIT}.)
 */
class OnboardingServiceTest {

    private static final class MutableClock extends Clock {

        Instant now = Instant.parse("2026-10-12T10:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private final ObjectMapper om = new ObjectMapper();
    private final MutableClock clock = new MutableClock();

    private OnboardingDraftRepository drafts;
    private BioRepository bios;
    private ProfileItemRepository items;
    private ProfileItemService profileItems;
    private DemoAccountService demo;
    private OnboardingService service;

    private OnboardingDraft draftRow;
    private Bio bioRow;
    private final List<ProfileItem> itemRows = new ArrayList<>();

    @BeforeEach
    void setUp() {
        User user = new User();
        user.setId(7L);
        user.setLogin("alice");
        UserRepository users = mock(UserRepository.class);
        when(users.findOneByLogin("alice")).thenReturn(Optional.of(user));

        drafts = mock(OnboardingDraftRepository.class);
        when(drafts.findByUserId(anyLong())).thenAnswer(inv -> Optional.ofNullable(draftRow));
        when(drafts.save(any())).thenAnswer(inv -> draftRow = inv.getArgument(0));
        when(drafts.deleteByUserId(anyLong())).thenAnswer(inv -> {
            int n = draftRow == null ? 0 : 1;
            draftRow = null;
            return n;
        });

        bios = mock(BioRepository.class);
        when(bios.findByUserId(anyLong())).thenAnswer(inv -> bioRow == null ? List.of() : List.of(bioRow));
        when(bios.save(any())).thenAnswer(inv -> bioRow = inv.getArgument(0));
        when(bios.saveAndFlush(any())).thenAnswer(inv -> bioRow = inv.getArgument(0));

        items = mock(ProfileItemRepository.class);
        when(items.findByUserIdAndDeletedAtIsNullOrderBySectionAscPositionAsc(anyLong())).thenAnswer(inv -> itemRows);

        profileItems = mock(ProfileItemService.class);
        when(profileItems.completeness()).thenReturn(new ProfileItemService.CompletenessDTO(55, Map.of(), null));

        demo = mock(DemoAccountService.class);

        AppSettingRepository settingRows = mock(AppSettingRepository.class);
        when(settingRows.findAll()).thenReturn(List.of());
        ResumeBuilderSettings settings = new ResumeBuilderSettings(settingRows, om);

        service = new OnboardingService(drafts, bios, users, items, profileItems, settings, demo, clock);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("alice", "x"));
    }

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    // ---- helpers ------------------------------------------------------------

    private JsonNode json(String s) throws Exception {
        return om.readTree(s);
    }

    private DraftRequest draft(String step, String persona, String stateJson, Instant base, Boolean force) throws Exception {
        return new DraftRequest(2, step, persona, 2, 7, json(stateJson), base, force);
    }

    private DraftRequest draft(String stateJson) throws Exception {
        return draft("source", null, stateJson, null, null);
    }

    private void bio(String payload, String meta) {
        bioRow = new Bio();
        bioRow.setId(3L);
        bioRow.setPayload(payload);
        bioRow.setMetaJson(meta);
        bioRow.setUpdatedAt(Instant.parse("2026-10-01T00:00:00Z"));
    }

    // ---- the draft ----------------------------------------------------------

    @Test
    void firstSaveCreatesTheDraftWithTheTtlFromTheSetting() throws Exception {
        DraftSavedDTO saved = service.putDraft(draft("hello", null, "{\"a\":1}", null, null));

        assertThat(saved.updatedAt()).isEqualTo(clock.now);
        assertThat(saved.expiresAt()).isEqualTo(clock.now.plus(Duration.ofDays(30)));
        assertThat(draftRow.getUserId()).isEqualTo(7L);
        assertThat(draftRow.getStep()).isEqualTo("hello");
        assertThat(draftRow.getStateJson()).isEqualTo("{\"a\":1}");
        assertThat(draftRow.getCreatedAt()).isEqualTo(clock.now);
    }

    @Test
    void aLaterSaveMovesTheTokenAndTheExpiryButKeepsCreatedAt() throws Exception {
        DraftSavedDTO first = service.putDraft(draft("{\"a\":1}"));
        Instant created = draftRow.getCreatedAt();
        clock.advance(Duration.ofDays(2));

        DraftSavedDTO second = service.putDraft(draft("review", null, "{\"a\":2}", first.updatedAt(), null));

        assertThat(second.updatedAt()).isAfter(first.updatedAt());
        assertThat(second.expiresAt()).isEqualTo(second.updatedAt().plus(Duration.ofDays(30)));
        assertThat(draftRow.getCreatedAt()).isEqualTo(created);
        assertThat(draftRow.getStateJson()).isEqualTo("{\"a\":2}");
        assertThat(draftRow.getStep()).isEqualTo("review");
    }

    @Test
    void aStaleBaseIsAConflictAndForceOverridesIt() throws Exception {
        DraftSavedDTO first = service.putDraft(draft("{\"a\":1}"));
        clock.advance(Duration.ofMinutes(5));
        service.putDraft(draft("source", null, "{\"a\":2}", first.updatedAt(), null)); // the other device

        assertThatThrownBy(() -> service.putDraft(draft("source", null, "{\"a\":3}", first.updatedAt(), null)))
            .isInstanceOfSatisfying(OnboardingException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(409);
                assertThat(e.getCode()).isEqualTo("DRAFT_CONFLICT");
                assertThat(e.getExtra()).containsEntry("serverUpdatedAt", draftRow.getUpdatedAt().toString());
            });
        assertThat(draftRow.getStateJson()).as("a conflict writes nothing").isEqualTo("{\"a\":2}");

        service.putDraft(draft("source", null, "{\"a\":3}", first.updatedAt(), true));
        assertThat(draftRow.getStateJson()).isEqualTo("{\"a\":3}");
    }

    @Test
    void noBaseWhileADraftExistsIsAConflictToo() throws Exception {
        service.putDraft(draft("{\"a\":1}"));
        assertThatThrownBy(() -> service.putDraft(draft("{\"a\":2}")))
            .isInstanceOfSatisfying(OnboardingException.class, e -> assertThat(e.getCode()).isEqualTo("DRAFT_CONFLICT"));
        assertThat(draftRow.getStateJson()).isEqualTo("{\"a\":1}");
    }

    @Test
    void anExpiredDraftIsAbsentAndIsOverwrittenWithoutAConflict() throws Exception {
        service.putDraft(draft("{\"a\":1}"));
        clock.advance(Duration.ofDays(31)); // past the TTL, the purge has not run

        assertThat(service.status(false).status()).isEqualTo(Status.NONE);
        assertThat(service.status(false).draft()).isNull();

        DraftSavedDTO again = service.putDraft(draft("{\"a\":9}"));
        assertThat(again.updatedAt()).isEqualTo(clock.now);
        assertThat(draftRow.getCreatedAt()).as("a fresh draft").isEqualTo(clock.now);
    }

    @Test
    void invalidRequestsAre422WithThePathAndWriteNothing() throws Exception {
        record Bad(DraftRequest req, String path) {}
        List<Bad> cases = List.of(
            new Bad(new DraftRequest(1, "source", null, 1, 7, json("{}"), null, null), "v"),
            new Bad(new DraftRequest(null, "source", null, 1, 7, json("{}"), null, null), "v"),
            new Bad(new DraftRequest(2, "nowhere", null, 1, 7, json("{}"), null, null), "step"),
            new Bad(new DraftRequest(2, "done", null, 1, 7, json("{}"), null, null), "step"),
            new Bad(new DraftRequest(2, "source", null, 1, 0, json("{}"), null, null), "stepsTotal"),
            new Bad(new DraftRequest(2, "source", null, 1, 8, json("{}"), null, null), "stepsTotal"),
            new Bad(new DraftRequest(2, "source", null, 8, 7, json("{}"), null, null), "stepsDone"),
            new Bad(new DraftRequest(2, "source", null, -1, 7, json("{}"), null, null), "stepsDone"),
            new Bad(new DraftRequest(2, "source", "wizard", 1, 7, json("{}"), null, null), "persona"),
            new Bad(new DraftRequest(2, "source", null, 1, 7, json("[1]"), null, null), "state"),
            new Bad(new DraftRequest(2, "source", null, 1, 7, null, null, null), "state")
        );
        for (Bad b : cases) {
            assertThatThrownBy(() -> service.putDraft(b.req()))
                .as(b.path())
                .isInstanceOfSatisfying(OnboardingException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(422);
                    assertThat(e.getCode()).isEqualTo("DRAFT_INVALID");
                    assertThat(e.getExtra()).containsEntry("path", b.path());
                });
        }
        assertThat(draftRow).isNull();
        verify(bios, never()).save(any());
    }

    @Test
    void aDraftOverTheCapIs413WithTheCap() throws Exception {
        String big = "{\"x\":\"" + "a".repeat(262_200) + "\"}";
        assertThatThrownBy(() -> service.putDraft(draft(big)))
            .isInstanceOfSatisfying(OnboardingException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(413);
                assertThat(e.getCode()).isEqualTo("DRAFT_TOO_LARGE");
                assertThat(e.getExtra()).containsEntry("max", 262144);
            });
        assertThat(draftRow).isNull();
    }

    @Test
    void aNeverCollectedValueIsRefusedWithThePathAndTheClass() throws Exception {
        assertThatThrownBy(() -> service.putDraft(draft("{\"parsed\":{\"identity\":{\"note\":\"SSN 123-45-6789\"}}}")))
            .isInstanceOfSatisfying(SensitiveContentException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(422);
                assertThat(e.getCode()).isEqualTo("SENSITIVE_CONTENT");
                assertThat(e.getSensitiveClass()).isEqualTo("SSN_ITIN");
                assertThat(e.getPath()).isEqualTo("state.parsed.identity.note");
            });
        assertThat(draftRow).as("the row is not written").isNull();
    }

    @Test
    void aDraftNeverTouchesTheBioPayloadOrItsUpdatedAt() throws Exception {
        bio("{\"firstName\":\"Alice\"}", "{\"provenance\":{\"firstName\":\"user\"}}");
        Instant before = bioRow.getUpdatedAt();

        service.putDraft(draft("{\"a\":1}"));
        service.putDraft(draft("hello", "student", "{\"a\":2}", draftRow.getUpdatedAt(), null));

        assertThat(bioRow.getPayload()).isEqualTo("{\"firstName\":\"Alice\"}");
        assertThat(bioRow.getUpdatedAt()).isEqualTo(before);
        assertThat(ProfileMeta.onboarding(ProfileMeta.read(bioRow.getMetaJson())).persona()).isEqualTo("student");
    }

    @Test
    void thePersonaIsMirroredToTheMetaAndTheDraftRow() throws Exception {
        service.putDraft(draft("hello", "first_job", "{}", null, null));

        assertThat(draftRow.getPersona()).isEqualTo("first_job");
        assertThat(bioRow).as("a bio row is made to hold the persona").isNotNull();
        assertThat(bioRow.getPayload()).isEqualTo("{}");
        ProfileMeta.OnboardingMeta o = ProfileMeta.onboarding(ProfileMeta.read(bioRow.getMetaJson()));
        assertThat(o.persona()).isEqualTo("first_job");
        assertThat(o.startedAt()).isEqualTo(clock.now);
        assertThat(o.source()).isEqualTo("web");
    }

    @Test
    void aDraftWithoutAPersonaDoesNotCreateABioRow() throws Exception {
        service.putDraft(draft("{}"));
        assertThat(bioRow).isNull();
        verify(bios, never()).saveAndFlush(any());
    }

    @Test
    void autosavesThatChangeNoMarkerDoNotRewriteTheBio() throws Exception {
        bio("{}", null);
        DraftSavedDTO a = service.putDraft(draft("hello", "student", "{\"n\":1}", null, null));
        verify(bios, times(1)).save(any());
        clock.advance(Duration.ofSeconds(1));
        service.putDraft(draft("hello", "student", "{\"n\":2}", a.updatedAt(), null));
        clock.advance(Duration.ofSeconds(1));
        service.putDraft(draft("review", null, "{\"n\":3}", draftRow.getUpdatedAt(), null));
        verify(bios, times(1)).save(any());
    }

    @Test
    void deletingTheDraftKeepsThePersona() throws Exception {
        service.putDraft(draft("hello", "student", "{}", null, null));
        service.deleteDraft();

        assertThat(draftRow).isNull();
        assertThat(service.status(false).persona()).isEqualTo("student");
    }

    // ---- status -------------------------------------------------------------

    @Test
    void statusIsNoneThenDraftWithTheStateOnlyWhenAsked() throws Exception {
        assertThat(service.status(false).status()).isEqualTo(Status.NONE);

        service.putDraft(draft("review", null, "{\"cards\":[1,2,3]}", null, null));
        StatusDTO plain = service.status(false);
        assertThat(plain.status()).isEqualTo(Status.DRAFT);
        assertThat(plain.draft().step()).isEqualTo("review");
        assertThat(plain.draft().stepsDone()).isEqualTo(2);
        assertThat(plain.draft().stepsTotal()).isEqualTo(7);
        assertThat(plain.draft().state()).isNull();
        assertThat(plain.card().show()).isTrue();
        assertThat(plain.card().state().name()).isEqualTo("IN_PROGRESS");

        assertThat(service.status(true).draft().state().path("cards").size()).isEqualTo(3);
    }

    @Test
    void anOldOnboardedAtFlagReadsAsFinishedWithoutABackfill() throws Exception {
        bio("{\"onboardedAt\":\"2026-09-01T08:00:00.000Z\"}", null);
        StatusDTO s = service.status(false);
        assertThat(s.status()).isEqualTo(Status.FINISHED);
        assertThat(s.finishedAt()).isEqualTo(Instant.parse("2026-09-01T08:00:00Z"));

        bio("{\"onboardedAt\":\"yes\"}", null);
        StatusDTO odd = service.status(false);
        assertThat(odd.status()).isEqualTo(Status.FINISHED);
        assertThat(odd.finishedAt()).isNull();

        bio("{\"onboardedAt\":\"  \"}", null);
        assertThat(service.status(false).status()).isEqualTo(Status.NONE);
    }

    @Test
    void theCardIsHiddenForAFinishedProfileAboveTheThresholdAndShownWhenThin() {
        bio("{\"onboardedAt\":\"2026-09-01T08:00:00.000Z\"}", "{\"completeness\":{\"score\":70}}");
        assertThat(service.status(false).card().show()).isFalse();

        bio("{\"onboardedAt\":\"2026-09-01T08:00:00.000Z\"}", "{\"completeness\":{\"score\":30}}");
        StatusDTO thin = service.status(false);
        assertThat(thin.card().show()).isTrue();
        assertThat(thin.completeness().score()).isEqualTo(30);
        assertThat(thin.completeness().promptBelow()).isEqualTo(40);
        assertThat(thin.completeness().resurfaceBelow()).isEqualTo(20);
    }

    @Test
    void theScoreIsComputedWhenThereIsNoCache() {
        bio("{}", null);
        assertThat(service.status(false).completeness().score()).isEqualTo(55);
        verify(profileItems, atLeastOnce()).completeness();
    }

    @Test
    void aResurfacedCardIsCountedOncePerShowing() {
        Instant dismissed = clock.now.minus(Duration.ofDays(20));
        bio("{}", "{\"completeness\":{\"score\":10},\"onboarding\":{\"card\":{\"dismissedAt\":\"" + dismissed + "\",\"resurfaceCount\":0}}}");

        StatusDTO first = service.status(false);
        assertThat(first.card().show()).isTrue();
        assertThat(first.card().resurfaced()).isTrue();
        assertThat(first.card().resurfaceCount()).isEqualTo(1);

        assertThat(service.status(false).card().resurfaceCount()).as("the same showing").isEqualTo(1);
        assertThat(service.status(false).card().resurfaceCount()).isEqualTo(1);

        // Dismissed again: hidden for the wait, then a second showing counts once more.
        service.patch(new PatchRequest(null, new CardPatch("DISMISS")));
        assertThat(service.status(false).card().show()).isFalse();
        clock.advance(Duration.ofDays(15));
        StatusDTO second = service.status(false);
        assertThat(second.card().show()).isTrue();
        assertThat(second.card().resurfaceCount()).isEqualTo(2);

        // The cap (2) stops a third showing.
        service.patch(new PatchRequest(null, new CardPatch("DISMISS")));
        clock.advance(Duration.ofDays(15));
        assertThat(service.status(false).card().show()).isFalse();
    }

    @Test
    void aDemoLoginDoesNotCountAShowing() {
        when(demo.isDemo("alice")).thenReturn(true);
        Instant dismissed = clock.now.minus(Duration.ofDays(20));
        bio("{}", "{\"completeness\":{\"score\":10},\"onboarding\":{\"card\":{\"dismissedAt\":\"" + dismissed + "\",\"resurfaceCount\":0}}}");

        assertThat(service.status(false).card().resurfaceCount()).isZero();
    }

    // ---- patch --------------------------------------------------------------

    @Test
    void personaIsSetClearedLeftAloneAndValidated() throws Exception {
        bio("{}", null);
        assertThat(service.patch(new PatchRequest(json("\"student\""), null)).persona()).isEqualTo("student");
        assertThat(service.patch(new PatchRequest(null, null)).persona()).as("absent leaves it").isEqualTo("student");
        assertThat(service.patch(new PatchRequest(json("null"), null)).persona()).as("null clears it").isNull();

        for (String bad : List.of("\"wizard\"", "\"Student\"", "5", "true", "[]")) {
            assertThatThrownBy(() -> service.patch(new PatchRequest(json(bad), null)))
                .as(bad)
                .isInstanceOfSatisfying(OnboardingException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(422);
                    assertThat(e.getCode()).isEqualTo("PERSONA_INVALID");
                });
        }
    }

    @Test
    void aPersonaChangeReachesAnExistingDraftRow() throws Exception {
        service.putDraft(draft("hello", "student", "{}", null, null));
        service.patch(new PatchRequest(json("\"experienced\""), null));
        assertThat(draftRow.getPersona()).isEqualTo("experienced");
    }

    @Test
    void cardActionsSnoozeDismissAndReset() throws Exception {
        bio("{}", "{\"completeness\":{\"score\":5}}");

        StatusDTO snoozed = service.patch(new PatchRequest(null, new CardPatch("SNOOZE")));
        assertThat(snoozed.card().snoozedUntil()).isEqualTo(clock.now.plus(Duration.ofDays(3)));
        assertThat(snoozed.card().show()).isFalse();

        StatusDTO dismissed = service.patch(new PatchRequest(null, new CardPatch("DISMISS")));
        assertThat(dismissed.card().dismissedAt()).isEqualTo(clock.now);
        assertThat(dismissed.card().snoozedUntil()).as("a dismissal ends the snooze").isNull();
        assertThat(dismissed.card().show()).isFalse();

        StatusDTO reset = service.patch(new PatchRequest(null, new CardPatch("RESET")));
        assertThat(reset.card().dismissedAt()).isNull();
        assertThat(reset.card().snoozedUntil()).isNull();
        assertThat(reset.card().resurfaceCount()).isZero();
        assertThat(reset.card().show()).isTrue();

        assertThatThrownBy(() -> service.patch(new PatchRequest(null, new CardPatch("FLY"))))
            .isInstanceOfSatisfying(OnboardingException.class, e -> assertThat(e.getExtra()).containsEntry("path", "card.action"));
    }

    @Test
    void aPatchThatChangesNothingWritesNothing() {
        bio("{}", null);
        service.patch(new PatchRequest(null, null));
        verify(bios, never()).save(any());
    }

    // ---- finish -------------------------------------------------------------

    @Test
    void finishStampsTheMarkersDeletesTheDraftAndCountsTheCoverage() throws Exception {
        bio("{\"firstName\":\"Alice\",\"lastName\":\"A\",\"email\":\"a@x.io\"}", null);
        service.putDraft(draft("prefs", "student", "{}", null, null));
        Instant started = ProfileMeta.onboarding(ProfileMeta.read(bioRow.getMetaJson())).startedAt();
        clock.advance(Duration.ofMinutes(3));
        ProfileItem exp = new ProfileItem();
        exp.setSection(ProfileSection.EXPERIENCE);
        itemRows.add(exp);

        FinishDTO f = service.finish();

        assertThat(f.finishedAt()).isEqualTo(clock.now);
        assertThat(f.completeness().score()).isEqualTo(55);
        assertThat(f.coverage().fields()).as("firstName, lastName, fullName, email + one job").isEqualTo(4 + 5);
        assertThat(f.coverage().groups()).containsEntry("contact", 4).containsEntry("work", 5);
        assertThat(draftRow).isNull();
        JsonNode payload = json(bioRow.getPayload());
        assertThat(payload.path("onboardedAt").asText()).isEqualTo(clock.now.toString());
        assertThat(payload.path("firstName").asText()).isEqualTo("Alice");
        ProfileMeta.OnboardingMeta o = ProfileMeta.onboarding(ProfileMeta.read(bioRow.getMetaJson()));
        assertThat(o.finishedAt()).isEqualTo(clock.now);
        assertThat(o.startedAt()).isEqualTo(started);
        assertThat(service.status(false).status()).isEqualTo(Status.FINISHED);
    }

    @Test
    void finishTwiceReturnsTheSameAndChangesNothing() throws Exception {
        bio("{\"firstName\":\"Alice\"}", null);
        FinishDTO first = service.finish();
        String payloadAfterFirst = bioRow.getPayload();
        String metaAfterFirst = bioRow.getMetaJson();
        clock.advance(Duration.ofHours(1));

        FinishDTO second = service.finish();

        assertThat(second).isEqualTo(first);
        assertThat(bioRow.getPayload()).isEqualTo(payloadAfterFirst);
        assertThat(bioRow.getMetaJson()).isEqualTo(metaAfterFirst);
    }

    @Test
    void finishKeepsAnExistingOnboardedAtAndUsesItAsTheFinishTime() throws Exception {
        bio("{\"onboardedAt\":\"2026-09-01T08:00:00.000Z\"}", null);

        FinishDTO f = service.finish();

        assertThat(f.finishedAt()).isEqualTo(Instant.parse("2026-09-01T08:00:00Z"));
        assertThat(json(bioRow.getPayload()).path("onboardedAt").asText()).isEqualTo("2026-09-01T08:00:00.000Z");
    }

    @Test
    void finishWithNoBioMakesOne() throws Exception {
        FinishDTO f = service.finish();
        assertThat(f.finishedAt()).isEqualTo(clock.now);
        assertThat(bioRow).isNotNull();
        assertThat(json(bioRow.getPayload()).path("onboardedAt").asText()).isNotBlank();
        assertThat(f.coverage().fields()).isZero();
    }
}
