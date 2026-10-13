package com.dossier.api.service;

import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.StoredFileEraser;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.domain.enumeration.ResumeRole;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.ResumeAiProposalRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeDocVersionRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.BioDTO;
import com.dossier.api.service.dto.ResumeActorDTO;
import com.dossier.api.service.dto.ResumeDTO;
import com.dossier.api.service.mapper.BioMapper;
import com.dossier.api.service.mapper.ResumeMapper;
import com.dossier.api.service.resume.ResumeLifecycle;
import com.dossier.api.service.resume.ResumePdfState;
import com.dossier.api.service.resume.ResumeRenderHash;
import com.dossier.api.service.resume.ResumeTags;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The sync surface the extension and web app use: everything is scoped to the
 * authenticated user. Unlike the generated {@code BioResource}/{@code ResumeResource}
 * (raw id-based CRUD), these operations never expose or touch another user's data.
 * One Bio per user (the "profile"); many resumes — capped at {@link #FREE_RESUME_LIMIT} on
 * the Free plan (Phase 12.4).
 */
@Service
@Transactional
public class ProfileService {

    private static final Logger LOG = LoggerFactory.getLogger(ProfileService.class);

    /** Provenance recorded for bio keys the user edits themselves. */
    public static final String PROVENANCE_USER = "user";
    /** Provenance recorded for bio keys accepted from a learned suggestion. */
    public static final String PROVENANCE_LEARNED = "learned";

    /**
     * How many live resumes a Free user may keep (Phase 12.4). <b>Archived resumes don't count</b>
     * — archiving is how someone at the cap makes room, and it is also why a downgrade never
     * destroys anything: a lapsed Pro user keeps every resume they had and simply can't add a
     * fourth live one until they archive or upgrade.
     */
    public static final int FREE_RESUME_LIMIT = 3;
    /** Pro's cap (15.5, was unlimited): a ceiling no real search needs, against abuse and cost. */
    public static final int PRO_RESUME_LIMIT = 25;
    /**
     * Autopilot's cap (50, per CLAUDE.md). <b>Not yet enforced separately</b>: until Phase 18 puts
     * plans on a DB catalog, {@link EntitlementService} only distinguishes Free from Pro, so
     * Autopilot is gated exactly like Pro ({@link #PRO_RESUME_LIMIT}). {@link #resumeLimit} is the
     * one place to switch when the plan catalog lands.
     */
    public static final int AUTOPILOT_RESUME_LIMIT = 50;

    private final BioRepository bioRepository;
    private final ResumeRepository resumeRepository;
    private final UserRepository userRepository;
    private final ApplicationRepository applicationRepository;
    private final BioMapper bioMapper;
    private final ResumeMapper resumeMapper;
    private final FileStorage storageService;
    private final EntitlementService entitlementService;
    private final ResumeDocRepository resumeDocRepository;
    private final ResumeDocVersionRepository resumeDocVersionRepository;
    private final ResumeAiProposalRepository resumeAiProposalRepository;
    private final ProfileItemService profileItemService;
    private final ResumeBuilderSettings settings;
    private final ResumeActors resumeActors;
    private final ResumeDocVersionService resumeDocVersionService;
    private final ResumeLineageService resumeLineageService;
    private final StoredFileEraser storedFileEraser;

    public ProfileService(
        BioRepository bioRepository,
        ResumeRepository resumeRepository,
        UserRepository userRepository,
        ApplicationRepository applicationRepository,
        BioMapper bioMapper,
        ResumeMapper resumeMapper,
        FileStorage storageService,
        EntitlementService entitlementService,
        ResumeDocRepository resumeDocRepository,
        ResumeDocVersionRepository resumeDocVersionRepository,
        ResumeAiProposalRepository resumeAiProposalRepository,
        ProfileItemService profileItemService,
        ResumeBuilderSettings settings,
        ResumeActors resumeActors,
        ResumeDocVersionService resumeDocVersionService,
        ResumeLineageService resumeLineageService,
        StoredFileEraser storedFileEraser
    ) {
        this.storedFileEraser = storedFileEraser;
        this.settings = settings;
        this.resumeActors = resumeActors;
        this.resumeDocVersionService = resumeDocVersionService;
        this.resumeLineageService = resumeLineageService;
        this.bioRepository = bioRepository;
        this.resumeRepository = resumeRepository;
        this.userRepository = userRepository;
        this.applicationRepository = applicationRepository;
        this.bioMapper = bioMapper;
        this.resumeMapper = resumeMapper;
        this.storageService = storageService;
        this.entitlementService = entitlementService;
        this.resumeDocRepository = resumeDocRepository;
        this.resumeDocVersionRepository = resumeDocVersionRepository;
        this.resumeAiProposalRepository = resumeAiProposalRepository;
        this.profileItemService = profileItemService;
    }

    // ---- profile (single bio per user) -------------------------------------

    @Transactional(readOnly = true)
    public Optional<BioDTO> getProfile() {
        return bioRepository.findByUserIsCurrentUser().stream().findFirst().map(bioMapper::toDto);
    }

    /**
     * Create the user's bio if absent, otherwise overwrite its payload (one per user). Every key that
     * changed is stamped {@code meta.provenance[key] = "user"} (Resume Builder R1.1) and the cached
     * completeness is refreshed; neither touches what the extension reads.
     */
    public BioDTO upsertProfile(String payload) {
        return upsertProfile(payload, PROVENANCE_USER);
    }

    /** As {@link #upsertProfile(String)} but stamping changed keys with {@code source} (e.g. {@code "learned"}). */
    public BioDTO upsertProfile(String payload, String source) {
        User user = currentUser();
        Bio bio = bioRepository.findByUserIsCurrentUser().stream().findFirst().orElseGet(Bio::new);
        String before = bio.getPayload();
        bio.setPayload(payload);
        bio.setUpdatedAt(Instant.now());
        bio.setUser(user);
        profileItemService.onBioWritten(bio, before, payload, source);
        return bioMapper.toDto(bioRepository.save(bio));
    }

    // ---- resumes (many per user) -------------------------------------------

    @Transactional(readOnly = true)
    public List<ResumeDTO> listResumes() {
        return enrich(rawResumes());
    }

    /** The mapper's output alone: what {@link ProfileVersion} hashes, without any of the list's extra lookups. */
    private List<ResumeDTO> rawResumes() {
        return resumeRepository.findByUserIsCurrentUser().stream().map(resumeMapper::toDto).toList();
    }

    /**
     * Fill what is not on {@code Resume} itself: {@code templateId} and the export state
     * ({@code contentHash}, {@code exportedHash}, {@code exportedAt}) of BUILT resumes (they live on the
     * web-only {@code resume_doc} row), the {@code lifecycle} (DESIGN 8.10) and the display labels of
     * {@code createdBy}/{@code updatedBy}. A handful of narrow queries, and none of the document ones
     * for users without a built resume.
     */
    private List<ResumeDTO> enrich(List<ResumeDTO> dtos) {
        if (dtos.isEmpty()) {
            return dtos;
        }
        Long userId = currentUser().getId();
        boolean anyBuilt = dtos.stream().anyMatch(d -> d.getKind() == ResumeKind.BUILT);
        Map<Long, ResumeDocRepository.BuiltMetaRow> meta = new HashMap<>();
        Set<Long> checkpoints = Set.of();
        if (anyBuilt) {
            resumeDocRepository.findBuiltMetaByUserId(userId).forEach(r -> meta.put(r.getResumeId(), r));
            checkpoints = resumeDocVersionService.checkpointResumeIds(userId);
        }
        Set<String> logins = new HashSet<>();
        for (ResumeDTO d : dtos) {
            if (d.getCreatedBy() != null) logins.add(d.getCreatedBy().login());
            if (d.getUpdatedBy() != null) logins.add(d.getUpdatedBy().login());
        }
        Map<String, ResumeActorDTO> actors = resumeActors.resolve(logins);
        for (ResumeDTO d : dtos) {
            Instant exportedAt = null;
            if (d.getKind() == ResumeKind.BUILT) {
                ResumeDocRepository.BuiltMetaRow row = meta.get(d.getId());
                if (row != null) {
                    d.setTemplateId(row.getTemplateId());
                    d.setContentHash(row.getContentHash());
                    d.setExportedHash(row.getExportedHash());
                    d.setExportedAt(row.getExportedAt());
                    d.setScore(row.getScore());
                    d.setThumbHash(row.getThumbHash());
                    exportedAt = row.getExportedAt();
                    // R3.7: the stored PDF's state (STALE is derived from the render hash), for the list chips and the extension.
                    String renderHash = ResumeRenderHash.computeFromThemeJson(row.getContentHash(), row.getTemplateId(), row.getThemeJson());
                    d.setPdf(ResumePdfState.toDto(row.getPdfStatus(), row.getExportedHash(), row.getExportedAt(), renderHash, row.getPdfAttempts(), row.getPdfError()));
                }
            }
            if (d.getCreatedBy() != null) d.setCreatedBy(actors.get(d.getCreatedBy().login()));
            if (d.getUpdatedBy() != null) d.setUpdatedBy(actors.get(d.getUpdatedBy().login()));
            d.setLifecycle(ResumeLifecycle.of(d.getArchived(), d.getKind(), checkpoints.contains(d.getId()), exportedAt));
        }
        return dtos;
    }

    /**
     * A fingerprint of everything {@link #getProfile()} + {@link #listResumes()} would return
     * (Phase 11.2). The extension compares it to the one it last pulled under and re-pulls only on
     * a mismatch. See {@link ProfileVersion} for why this is a hash rather than a counter.
     */
    @Transactional(readOnly = true)
    public String profileVersion() {
        return ProfileVersion.compute(getProfile(), rawResumes());
    }

    /**
     * Create a resume for the current user.
     *
     * <p>Both upload paths land here — the web's proxied upload and the extension's on-the-fly
     * one — which is why the Free cap is enforced here rather than in either controller.
     *
     * @throws ProRequiredException 402 {@code RESUME_LIMIT} when the user already holds their plan's
     *                              limit of live resumes: {@link #FREE_RESUME_LIMIT} on Free,
     *                              {@link #PRO_RESUME_LIMIT} on Pro.
     */
    public ResumeDTO createResume(ResumeDTO dto) {
        // Uploads and the extension's on-the-fly path are always UPLOADED, whatever the client sent:
        // a BUILT resume only exists together with its document (ResumeDocService.createBuilt).
        return createResume(dto, ResumeKind.UPLOADED);
    }

    /** As {@link #createResume(ResumeDTO)} but with an explicit {@code kind}; the plan cap applies either way. */
    public ResumeDTO createResume(ResumeDTO dto, ResumeKind kind) {
        User user = currentUser();
        enforceResumeLimit(user.getLogin());
        Resume resume = resumeMapper.toEntity(dto);
        resume.setId(null);
        resume.setKind(kind);
        resume.setUser(user);
        // Metadata (R3.9): a new resume is a master made and last written by the caller; whatever role or
        // audit login the client sent is ignored, and the org-sharing default comes from the settings seam.
        resume.setRole(ResumeRole.MASTER);
        resume.setCreatedByLogin(user.getLogin());
        resume.setUpdatedByLogin(user.getLogin());
        resume.setShareWithOrg(settings.getBool(ResumeBuilderSettingKeys.META_SHARE_WITH_ORG_DEFAULT));
        resume.setTarget(clipTarget(dto.getTarget()));
        if (resume.getCreatedAt() == null) {
            resume.setCreatedAt(Instant.now());
        }
        if (resume.getStatus() == null) {
            resume.setStatus(ResumeStatus.NEEDS_REVIEW);
        }
        // The file is uploaded separately (see ResumeFileResource); until then the
        // object key is empty (the column is non-null).
        if (resume.getr2ObjectKey() == null) {
            resume.setr2ObjectKey("");
        }
        // Default/base resume: the user's FIRST resume auto-becomes the default; an explicit
        // request also wins. Either way, unset any prior default first (at most one per user).
        boolean firstResume = resumeRepository.findByUserIsCurrentUser().isEmpty();
        if (Boolean.TRUE.equals(dto.getDefaultResume()) || firstResume) {
            clearDefaultForCurrentUser();
            resume.setDefaultResume(true);
        } else {
            resume.setDefaultResume(false);
        }
        Resume saved = resumeRepository.save(resume);
        // A user whose resumes are all archived has no primary: the new live one becomes it (exactly one).
        ensurePrimary(user.getId());
        return enrich(List.of(resumeMapper.toDto(saved))).get(0);
    }

    /** A target is free text of at most 80 characters; blank means none. */
    static String clipTarget(String target) {
        if (target == null) return null;
        String t = target.strip();
        if (t.isEmpty()) return null;
        return t.length() > ResumeMetaService.MAX_TARGET_CHARS ? t.substring(0, ResumeMetaService.MAX_TARGET_CHARS) : t;
    }

    /**
     * Keep the "exactly one primary" rule (R3.9, DESIGN 8.6): when the user has any non-archived resume,
     * exactly one of them is {@code is_default} and no archived resume is. If none is, the most recently
     * updated non-archived resume is promoted; if several are, the most recently updated of them stays.
     * When every resume is archived nothing changes. Called after create, archive/unarchive, delete and
     * a primary change; the extension's default resume is this flag ({@code defaultResume}).
     */
    public void ensurePrimary(Long userId) {
        List<Resume> all = resumeRepository.findByUserId(userId);
        Comparator<Resume> recency = Comparator
            .comparing((Resume r) -> r.getUpdatedAt() != null ? r.getUpdatedAt() : r.getCreatedAt(), Comparator.nullsFirst(Comparator.naturalOrder()))
            .thenComparing(Resume::getId, Comparator.nullsFirst(Comparator.naturalOrder()));
        List<Resume> live = all.stream().filter(r -> !Boolean.TRUE.equals(r.getArchived())).toList();
        if (live.isEmpty()) {
            return;
        }
        Resume keep = live
            .stream()
            .filter(r -> Boolean.TRUE.equals(r.getDefaultResume()))
            .max(recency)
            .orElseGet(() -> live.stream().max(recency).orElseThrow());
        for (Resume r : all) {
            boolean want = r.getId().equals(keep.getId());
            if (Boolean.TRUE.equals(r.getDefaultResume()) != want) {
                r.setDefaultResume(want);
                resumeRepository.save(r);
            }
        }
    }

    /** Make an owned, live resume the user's one primary (clears the previous one). The caller checked ownership and archived. */
    void makePrimary(Resume resume) {
        clearDefaultForCurrentUser();
        resume.setDefaultResume(true);
        resumeRepository.save(resume);
    }

    /**
     * The resume cap: non-archived resumes only — 3 on Free, 25 on Pro (15.5). It only stops a NEW
     * resume: resumes already over the cap (e.g. after a downgrade) stay readable and fillable.
     * The refusal carries {@code plan} so a client offers an upgrade only to a Free user.
     */
    private void enforceResumeLimit(String login) {
        enforceResumeLimitFor(login);
    }

    /**
     * Throws {@code 402 RESUME_LIMIT} when the current user is at their plan's live-resume cap - the check
     * {@link #createResume} makes, exposed so a create that does other work first (an upload to parse, a
     * resume to copy) can refuse before any of it (R2.6: "cap checked first").
     */
    public void assertCanCreateResume() {
        enforceResumeLimitFor(currentUser().getLogin());
    }

    private void enforceResumeLimitFor(String login) {
        boolean pro = entitlementService.isPro(login);
        int limit = resumeLimit(pro);
        long live = resumeRepository
            .findByUserIsCurrentUser()
            .stream()
            .filter(r -> !Boolean.TRUE.equals(r.getArchived()))
            .count();
        if (live >= limit) {
            throw new ProRequiredException(
                ProRequiredException.CODE_RESUME_LIMIT,
                pro
                    ? "Pro accounts keep up to " + limit + " resumes — archive one to add another"
                    : "Free accounts keep up to " + FREE_RESUME_LIMIT + " resumes — archive one, or upgrade to Pro",
                Map.of("limit", limit, "count", live, "plan", pro ? "PRO" : "FREE")
            );
        }
    }

    /** The live-resume cap for a plan. Autopilot shares Pro's until Phase 18 (see {@link #AUTOPILOT_RESUME_LIMIT}). */
    static int resumeLimit(boolean pro) {
        return pro ? PRO_RESUME_LIMIT : FREE_RESUME_LIMIT;
    }

    /**
     * Partial update (PATCH-like): only fields the client actually sends are written.
     * This lets the web app flip a single flag (e.g. {@code archived}) without having to
     * echo the whole resume back, and is harmless for the extension, which always pushes
     * the full DTO. A {@code null} field means "leave as-is", not "clear".
     */
    public ResumeDTO updateResume(Long id, ResumeDTO dto) {
        Resume resume = ownedResume(id);
        if (dto.getLabel() != null) {
            resume.setLabel(dto.getLabel());
        }
        if (dto.getParsedJson() != null) {
            resume.setParsedJson(dto.getParsedJson());
        }
        if (dto.getStatus() != null) {
            resume.setStatus(dto.getStatus());
        }
        // Only overwrite the stored-file pointer when the client actually sends one.
        if (dto.getr2ObjectKey() != null) {
            resume.setr2ObjectKey(dto.getr2ObjectKey());
        }
        if (dto.getArchived() != null) {
            resume.setArchived(dto.getArchived());
        }
        if (dto.getStarred() != null) {
            resume.setStarred(dto.getStarred());
        }
        // Setting a resume as default clears any other default (one per user); clearing it
        // just unsets this one (the user may then have no default).
        if (dto.getDefaultResume() != null) {
            if (Boolean.TRUE.equals(dto.getDefaultResume())) {
                clearDefaultForCurrentUser();
                resume.setDefaultResume(true);
            } else {
                resume.setDefaultResume(false);
            }
        }
        resume.setUpdatedByLogin(currentUser().getLogin());
        Resume saved = resumeRepository.save(resume);
        if (dto.getArchived() != null || dto.getDefaultResume() != null) {
            // Archiving the primary promotes another; clearing the only primary is undone: exactly one.
            ensurePrimary(saved.getUser().getId());
        }
        return enrich(List.of(resumeMapper.toDto(saved))).get(0);
    }

    /** Unset the default flag on all of the current user's resumes (before promoting a new default). */
    private void clearDefaultForCurrentUser() {
        for (Resume r : resumeRepository.findByUserIsCurrentUser()) {
            if (Boolean.TRUE.equals(r.getDefaultResume())) {
                r.setDefaultResume(false);
                resumeRepository.save(r);
            }
        }
    }

    public void deleteResume(Long id) {
        Resume resume = ownedResume(id);
        // Archive guard (3.5): never orphan a tracked application's resume reference. If
        // any application points at this resume, block the delete and nudge to archive.
        long refs = applicationRepository.countByResumeId(id);
        if (refs > 0) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "This resume is attached to " + refs + " tracked application" + (refs == 1 ? "" : "s") +
                ". Archive it instead of deleting so those applications keep their resume."
            );
        }
        String key = resume.getr2ObjectKey();
        Long userId = resume.getUser().getId();
        // Tailored copies of this master are cut loose first (DESIGN 8.9): each keeps its content and becomes a master.
        resumeLineageService.detachChildren(id, userId, currentUser().getLogin());
        resumeRepository.delete(resume);
        // resume_doc goes with the row (FK cascade); history and proposals have no FK, so clear them here.
        resumeDocVersionRepository.deleteAllByResumeIdAndUserId(id, userId);
        resumeAiProposalRepository.deleteAllByResumeIdAndUserId(id, userId);
        if (key != null && !key.isBlank()) {
            storageService.delete(key); // avoid orphaning bytes in the blob store
        }
        // Everything else stored for this resume - built PDFs from earlier renders, thumbnail, kept-aside original, photo.
        // Blobs go inside this transaction, so a storage failure rolls the delete back.
        storedFileEraser.deleteResumeFiles(userId, id);
        // Deleting the primary promotes the most recently updated live resume (exactly one primary).
        ensurePrimary(userId);
    }

    // ---- helpers -----------------------------------------------------------

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return userRepository.findOneByLogin(login).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found")
        );
    }

    /** Load a resume and ensure it belongs to the current user; 404 otherwise (no leak). */
    private Resume ownedResume(Long id) {
        String login = SecurityUtils.getCurrentUserLogin().orElse(null);
        Resume resume = resumeRepository.findById(id).orElse(null);
        if (resume == null || resume.getUser() == null || !resume.getUser().getLogin().equals(login)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume not found");
        }
        return resume;
    }
}
