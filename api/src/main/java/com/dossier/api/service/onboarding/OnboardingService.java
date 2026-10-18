package com.dossier.api.service.onboarding;

import static com.dossier.api.service.ResumeBuilderSettingKeys.*;

import com.dossier.api.domain.Bio;
import com.dossier.api.domain.OnboardingDraft;
import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.OnboardingDraftRepository;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.DemoAccountService;
import com.dossier.api.service.ProfileItemService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.dto.OnboardingDTOs.CardAction;
import com.dossier.api.service.dto.OnboardingDTOs.CardDTO;
import com.dossier.api.service.dto.OnboardingDTOs.CompletenessDTO;
import com.dossier.api.service.dto.OnboardingDTOs.CoverageDTO;
import com.dossier.api.service.dto.OnboardingDTOs.DraftDTO;
import com.dossier.api.service.dto.OnboardingDTOs.DraftRequest;
import com.dossier.api.service.dto.OnboardingDTOs.DraftSavedDTO;
import com.dossier.api.service.dto.OnboardingDTOs.FinishDTO;
import com.dossier.api.service.dto.OnboardingDTOs.PatchRequest;
import com.dossier.api.service.dto.OnboardingDTOs.Status;
import com.dossier.api.service.dto.OnboardingDTOs.StatusDTO;
import com.dossier.api.service.onboarding.AutofillCoverage.Counts;
import com.dossier.api.service.onboarding.OnboardingCardRules.Decision;
import com.dossier.api.service.privacy.SensitiveContent;
import com.dossier.api.service.resume.ProfileMeta;
import com.dossier.api.service.resume.ProfileMeta.OnboardingCard;
import com.dossier.api.service.resume.ProfileMeta.OnboardingMeta;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Onboarding v2's server half (R1.8, ONBOARDING-V2-DESIGN 3.4, 6, 8, 9): the resumable setup draft, the
 * persona and card markers in {@code bio.meta_json.onboarding}, the status the dashboard card reads, and
 * finish.
 *
 * <p>Everything is scoped to the signed-in user (no ids in any path). The draft is the working copy and the
 * profile the confirmed copy: a draft or marker write never touches {@code bio.payload} or {@code bio.updatedAt}
 * (so the extension's {@code ProfileVersion} does not move); only {@link #finish} writes {@code payload.onboardedAt}
 * (once, when blank). A draft is refused as a whole when any string in it matches a never-collected class
 * ({@link SensitiveContent}). The tunables are {@code onboarding.*} settings read per call.
 */
@Service
@Transactional
public class OnboardingService {

    /** The draft state schema version. */
    public static final int STATE_VERSION = 2;
    /** The most steps the progress counters can name (hello, source, review, skills, you, prefs, done). */
    public static final int MAX_STEPS = 7;
    /** The steps a draft can be on ({@code done} deletes the draft). */
    public static final List<String> STEPS = List.of("hello", "source", "review", "skills", "you", "prefs");
    public static final List<String> PERSONAS = List.of("student", "first_job", "switching", "experienced");
    private static final String SOURCE_WEB = "web";

    private final OnboardingDraftRepository draftRepository;
    private final BioRepository bioRepository;
    private final UserRepository userRepository;
    private final ProfileItemRepository itemRepository;
    private final ProfileItemService profileItemService;
    private final ResumeBuilderSettings settings;
    private final DemoAccountService demoAccounts;
    private final Clock clock;
    private final ObjectMapper om = new ObjectMapper();

    @Autowired
    public OnboardingService(
        OnboardingDraftRepository draftRepository,
        BioRepository bioRepository,
        UserRepository userRepository,
        ProfileItemRepository itemRepository,
        ProfileItemService profileItemService,
        ResumeBuilderSettings settings,
        DemoAccountService demoAccounts
    ) {
        this(draftRepository, bioRepository, userRepository, itemRepository, profileItemService, settings, demoAccounts, Clock.systemUTC());
    }

    OnboardingService(
        OnboardingDraftRepository draftRepository,
        BioRepository bioRepository,
        UserRepository userRepository,
        ProfileItemRepository itemRepository,
        ProfileItemService profileItemService,
        ResumeBuilderSettings settings,
        DemoAccountService demoAccounts,
        Clock clock
    ) {
        this.draftRepository = draftRepository;
        this.bioRepository = bioRepository;
        this.userRepository = userRepository;
        this.itemRepository = itemRepository;
        this.profileItemService = profileItemService;
        this.settings = settings;
        this.demoAccounts = demoAccounts;
        this.clock = clock;
    }

    // ---- status -----------------------------------------------------------------------------------

    /**
     * {@code GET /api/profile/onboarding}. A dismissed card that comes back is counted here, once per showing
     * (never for a demo login, whose data is shared).
     */
    public StatusDTO status(boolean includeState) {
        return buildStatus(currentUser(), includeState, true);
    }

    private StatusDTO buildStatus(User user, boolean includeState, boolean countShowing) {
        Long uid = user.getId();
        Instant now = now();
        Bio bio = bioOf(uid);
        ObjectNode meta = ProfileMeta.read(bio == null ? null : bio.getMetaJson());
        OnboardingMeta onboarding = ProfileMeta.onboarding(meta);
        boolean finished = finished(onboarding, bio);
        Instant finishedAt = finishedAt(onboarding, bio);
        OnboardingDraft draft = liveDraft(uid, now);

        Status status = finished ? Status.FINISHED : draft != null ? Status.DRAFT : Status.NONE;
        int score = score(bio, meta, uid);
        int promptBelow = settings.getInt(PROFILE_SETUP_PROMPT_BELOW_PERCENT);
        int resurfaceBelow = settings.getInt(ONBOARDING_CARD_RESURFACE_BELOW_PERCENT);

        OnboardingCard card = onboarding.card();
        Decision decision = OnboardingCardRules.decide(
            new OnboardingCardRules.Input(
                settings.getBool(FEATURE_ONBOARDING_V2),
                finished,
                score,
                promptBelow,
                resurfaceBelow,
                settings.getInt(ONBOARDING_CARD_RESURFACE_AFTER_DAYS),
                settings.getInt(ONBOARDING_CARD_MAX_RESURFACES),
                draft != null,
                card,
                now
            )
        );
        if (decision.startsNewShowing() && countShowing && bio != null && !demoAccounts.isDemo(user.getLogin())) {
            card = new OnboardingCard(card.dismissedAt(), card.snoozedUntil(), card.resurfaceCount() + 1, now);
            writeMeta(bio, meta, onboarding.withCard(card));
        }

        DraftDTO draftDto = draft == null
            ? null
            : new DraftDTO(draft.getStep(), draft.getStepsDone(), draft.getStepsTotal(), draft.getUpdatedAt(), includeState ? parse(draft.getStateJson()) : null);
        return new StatusDTO(
            status,
            onboarding.persona(),
            finishedAt,
            draftDto,
            new CardDTO(card.dismissedAt(), card.snoozedUntil(), card.resurfaceCount(), decision.show(), decision.state(), decision.resurfaced()),
            new CompletenessDTO(score, promptBelow, resurfaceBelow)
        );
    }

    // ---- the draft ---------------------------------------------------------------------------------

    /**
     * {@code PUT /api/profile/onboarding/draft}: upsert the user's draft. Refusals, in this order: 422
     * {@code DRAFT_INVALID} (unknown version / step, bad counters, a state that is not an object, a bad persona), 413
     * {@code DRAFT_TOO_LARGE}, 409 {@code DRAFT_CONFLICT} (the stored draft is newer than {@code baseUpdatedAt}, or
     * there is one and no base was sent - unless {@code force}), 422 {@code SENSITIVE_CONTENT}. A refusal writes nothing.
     */
    public DraftSavedDTO putDraft(DraftRequest req) {
        User user = currentUser();
        Long uid = user.getId();
        if (req == null) throw OnboardingException.invalid("body", "is required");
        if (req.v() == null || req.v() != STATE_VERSION) throw OnboardingException.invalid("v", "must be " + STATE_VERSION);
        if (req.step() == null || !STEPS.contains(req.step())) throw OnboardingException.invalid("step", "must be one of " + STEPS);
        if (req.stepsTotal() == null || req.stepsTotal() < 1 || req.stepsTotal() > MAX_STEPS) {
            throw OnboardingException.invalid("stepsTotal", "must be 1 to " + MAX_STEPS);
        }
        if (req.stepsDone() == null || req.stepsDone() < 0 || req.stepsDone() > req.stepsTotal()) {
            throw OnboardingException.invalid("stepsDone", "must be 0 to stepsTotal");
        }
        if (req.persona() != null && !PERSONAS.contains(req.persona())) throw OnboardingException.invalid("persona", "must be one of " + PERSONAS);
        if (req.state() == null || !req.state().isObject()) throw OnboardingException.invalid("state", "must be an object");

        int maxBytes = settings.getInt(ONBOARDING_DRAFT_MAX_BYTES);
        String stateJson = req.state().toString();
        if (stateJson.getBytes(StandardCharsets.UTF_8).length > maxBytes) throw OnboardingException.tooLarge(maxBytes);

        Instant now = now();
        OnboardingDraft draft = liveDraft(uid, now);
        if (draft != null && !Boolean.TRUE.equals(req.force()) && (req.baseUpdatedAt() == null || draft.getUpdatedAt().isAfter(req.baseUpdatedAt()))) {
            throw OnboardingException.conflict(draft.getUpdatedAt());
        }
        SensitiveContent.check("state", req.state());

        // Markers: the persona is mirrored to the meta, and the first draft stamps startedAt. A bio row is created only
        // when there is a persona to keep (the only write the extension's version can see, and only for an empty profile).
        Bio bio = bioOf(uid);
        ObjectNode meta = ProfileMeta.read(bio == null ? null : bio.getMetaJson());
        OnboardingMeta before = ProfileMeta.onboarding(meta);
        OnboardingMeta after = before;
        if (req.persona() != null) after = after.withPersona(req.persona());
        if (after.startedAt() == null && (bio != null || req.persona() != null)) after = after.withStarted(now, SOURCE_WEB);
        if (!after.equals(before)) {
            if (bio == null) {
                bio = newBio(user);
                meta = ProfileMeta.read(null);
            }
            writeMeta(bio, meta, after);
        }

        OnboardingDraft row = draft != null ? draft : existingOrNew(uid, now);
        row.setV(STATE_VERSION);
        row.setStep(req.step());
        row.setPersona(after.persona());
        row.setStepsDone(req.stepsDone());
        row.setStepsTotal(req.stepsTotal());
        row.setStateJson(stateJson);
        row.setUpdatedAt(now);
        row.setExpiresAt(now.plus(Duration.ofDays(settings.getInt(ONBOARDING_DRAFT_TTL_DAYS))));
        draftRepository.save(row);
        return new DraftSavedDTO(row.getUpdatedAt(), row.getExpiresAt());
    }

    /** {@code DELETE /api/profile/onboarding/draft}: start over. The persona and every confirmed profile value stay. */
    public void deleteDraft() {
        draftRepository.deleteByUserId(currentUser().getId());
    }

    // ---- persona and card -----------------------------------------------------------------------------

    /** {@code PATCH /api/profile/onboarding}: set / clear the persona and/or snooze, dismiss or reset the card. */
    public StatusDTO patch(PatchRequest req) {
        User user = currentUser();
        Long uid = user.getId();
        Instant now = now();
        Bio bio = bioOf(uid);
        ObjectNode meta = ProfileMeta.read(bio == null ? null : bio.getMetaJson());
        OnboardingMeta before = ProfileMeta.onboarding(meta);
        OnboardingMeta after = before;

        if (req != null && req.persona() != null) {
            JsonNode p = req.persona();
            if (p.isNull()) {
                after = after.withPersona(null);
            } else if (p.isTextual() && PERSONAS.contains(p.textValue())) {
                after = after.withPersona(p.textValue());
            } else {
                throw OnboardingException.personaInvalid();
            }
        }
        if (req != null && req.card() != null) {
            after = after.withCard(applyCardAction(after.card(), parseAction(req.card().action()), now));
        }
        if (!after.equals(before)) {
            if (bio == null) {
                bio = newBio(user);
                meta = ProfileMeta.read(null);
            }
            if (after.startedAt() == null) after = after.withStarted(now, SOURCE_WEB);
            writeMeta(bio, meta, after);
            if (!java.util.Objects.equals(before.persona(), after.persona())) {
                String persona = after.persona();
                draftRepository.findByUserId(uid).ifPresent(d -> d.setPersona(persona));
            }
        }
        return buildStatus(user, false, false);
    }

    private static CardAction parseAction(String raw) {
        if (raw != null) {
            for (CardAction a : CardAction.values()) if (a.name().equals(raw)) return a;
        }
        throw OnboardingException.invalid("card.action", "must be SNOOZE, DISMISS or RESET");
    }

    private OnboardingCard applyCardAction(OnboardingCard card, CardAction action, Instant now) {
        return switch (action) {
            case SNOOZE -> new OnboardingCard(
                card.dismissedAt(),
                now.plus(Duration.ofDays(settings.getInt(ONBOARDING_CARD_SNOOZE_DAYS))),
                card.resurfaceCount(),
                card.resurfacedAt()
            );
            case DISMISS -> new OnboardingCard(now, null, card.resurfaceCount(), card.resurfacedAt());
            case RESET -> OnboardingCard.empty();
        };
    }

    // ---- finish -------------------------------------------------------------------------------------

    /**
     * {@code POST /api/profile/onboarding/finish}: stamp {@code meta.onboarding.finishedAt} (kept when already set, else
     * the old {@code onboardedAt} when it is a date, else now), write {@code payload.onboardedAt} when blank (the flag
     * every existing reader looks at), delete the draft, recompute the completeness and count what the extension can now
     * fill. Idempotent: a second call changes nothing and returns the same numbers.
     */
    public FinishDTO finish() {
        User user = currentUser();
        Long uid = user.getId();
        Instant now = now();
        Bio bio = bioOf(uid);
        if (bio == null) bio = newBio(user);
        OnboardingDraft draft = draftRepository.findByUserId(uid).orElse(null);

        ObjectNode meta = ProfileMeta.read(bio.getMetaJson());
        OnboardingMeta before = ProfileMeta.onboarding(meta);
        Instant finishedAt = finishedAt(before, bio);
        if (finishedAt == null) finishedAt = now;
        OnboardingMeta after = before.withFinishedAt(finishedAt);
        if (after.startedAt() == null) after = after.withStarted(draft != null ? draft.getCreatedAt() : finishedAt, SOURCE_WEB);
        if (!after.equals(before)) ProfileMeta.putOnboarding(meta, after);
        bio.setMetaJson(ProfileMeta.write(meta));

        JsonNode payload = parseObject(bio.getPayload());
        if (payload instanceof ObjectNode on && blank(on.get(ONBOARDED_KEY))) {
            on.put(ONBOARDED_KEY, finishedAt.toString());
            bio.setPayload(on.toString());
            bio.setUpdatedAt(now);
        }
        bioRepository.save(bio);
        draftRepository.deleteByUserId(uid);

        ProfileItemService.CompletenessDTO c = profileItemService.completeness();
        Bio fresh = bioOf(uid);
        AutofillCoverage.Result coverage = AutofillCoverage.compute(fresh == null ? null : parseObject(fresh.getPayload()), counts(uid));
        return new FinishDTO(
            finishedAt,
            new CompletenessDTO(c.score(), settings.getInt(PROFILE_SETUP_PROMPT_BELOW_PERCENT), settings.getInt(ONBOARDING_CARD_RESURFACE_BELOW_PERCENT)),
            new CoverageDTO(coverage.fields(), coverage.groups())
        );
    }

    // ---- internals ----------------------------------------------------------------------------------

    /** The bio key the old wizard and {@code /welcome} wrote when they finished (the web's {@code ONBOARDED_KEY}). */
    static final String ONBOARDED_KEY = "onboardedAt";

    private Counts counts(Long uid) {
        int experience = 0;
        int education = 0;
        int skills = 0;
        for (ProfileItem item : itemRepository.findByUserIdAndDeletedAtIsNullOrderBySectionAscPositionAsc(uid)) {
            ProfileSection s = item.getSection();
            if (s == ProfileSection.EXPERIENCE) experience++;
            else if (s == ProfileSection.EDUCATION) education++;
            else if (s == ProfileSection.SKILL) skills++;
        }
        return new Counts(experience, education, skills);
    }

    /** The cached completeness score when there is one, else computed (which also fills the cache). */
    private int score(Bio bio, ObjectNode meta, Long uid) {
        JsonNode cached = meta.path(ProfileMeta.COMPLETENESS).path("score");
        if (bio != null && cached.isInt()) return cached.intValue();
        return profileItemService.completeness().score();
    }

    /** Finished when the marker says so or the old flag is set (the read-through that needs no backfill). */
    private boolean finished(OnboardingMeta onboarding, Bio bio) {
        if (onboarding.finishedAt() != null) return true;
        JsonNode payload = bio == null ? null : parseObject(bio.getPayload());
        return payload != null && !blank(payload.get(ONBOARDED_KEY));
    }

    /** When it finished: the marker, else the old flag when that is a date, else unknown (null). */
    private Instant finishedAt(OnboardingMeta onboarding, Bio bio) {
        if (onboarding.finishedAt() != null) return onboarding.finishedAt();
        JsonNode payload = bio == null ? null : parseObject(bio.getPayload());
        JsonNode flag = payload == null ? null : payload.get(ONBOARDED_KEY);
        if (blank(flag)) return null;
        try {
            return Instant.parse(flag.asText().trim());
        } catch (java.time.format.DateTimeParseException e) {
            return null; // an old client's non-date value: finished all the same, when unknown
        }
    }

    /** The user's draft unless its TTL has run out (the nightly purge may not have caught up). */
    private OnboardingDraft liveDraft(Long uid, Instant now) {
        return draftRepository.findByUserId(uid).filter(d -> d.getExpiresAt().isAfter(now)).orElse(null);
    }

    /** The user's row (an expired one is reused so the primary key never collides) or a new one. */
    private OnboardingDraft existingOrNew(Long uid, Instant now) {
        return draftRepository.findByUserId(uid).map(d -> {
            d.setCreatedAt(now);
            return d;
        }).orElseGet(() -> {
            OnboardingDraft d = new OnboardingDraft();
            d.setUserId(uid);
            d.setCreatedAt(now);
            return d;
        });
    }

    /** Writes {@code onboarding} into the meta and saves the bio - never touching the payload or {@code updatedAt}. */
    private void writeMeta(Bio bio, ObjectNode meta, OnboardingMeta onboarding) {
        ProfileMeta.putOnboarding(meta, onboarding);
        bio.setMetaJson(ProfileMeta.write(meta));
        bioRepository.save(bio);
    }

    private Bio bioOf(Long uid) {
        return bioRepository.findByUserId(uid).stream().findFirst().orElse(null);
    }

    /** Race-safe get-or-create of the bio ({@link BioProvisioner}); absent in hand-wired unit tests, which use the plain insert below. */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.dossier.api.service.BioProvisioner bioProvisioner;

    private Bio newBio(User user) {
        if (bioProvisioner != null) return bioProvisioner.getOrCreate(user);
        Bio bio = new Bio();
        bio.setPayload("{}");
        bio.setUpdatedAt(now());
        bio.setUser(user);
        return bioRepository.saveAndFlush(bio);
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private static boolean blank(JsonNode v) {
        return v == null || v.isNull() || (v.isTextual() && v.textValue().isBlank());
    }

    private JsonNode parse(String json) {
        try {
            return json == null || json.isBlank() ? null : om.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }

    private JsonNode parseObject(String json) {
        JsonNode n = parse(json);
        return n != null && n.isObject() ? n : null;
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return userRepository
            .findOneByLogin(login)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }
}
