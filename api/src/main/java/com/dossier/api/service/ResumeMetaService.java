package com.dossier.api.service;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.ResumeDocVersion;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.domain.enumeration.ResumeRole;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.ResumeActorDTO;
import com.dossier.api.service.dto.ResumeLineageDTO;
import com.dossier.api.service.dto.ResumeMetaDTO;
import com.dossier.api.service.dto.ResumePdfDTO;
import com.dossier.api.service.dto.ResumeVersionDTO;
import com.dossier.api.service.resume.ResumeDocument;
import com.dossier.api.service.resume.ResumeDocumentCanonical;
import com.dossier.api.service.resume.ResumeDocumentJson;
import com.dossier.api.service.resume.ResumeLifecycle;
import com.dossier.api.service.resume.ResumePdfState;
import com.dossier.api.service.resume.ResumeRenderHash;
import com.dossier.api.service.resume.ResumeMetaMirror;
import com.dossier.api.service.resume.ResumeTags;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Resume metadata, one model for built and uploaded resumes (Resume Builder R3.9, DESIGN 8.6, 8.8, 8.9,
 * 9.7, 9.10, 9.11): read it ({@link #get}), change it ({@link #patch}), walk the master to tailored
 * family ({@link #lineage}, {@link #detach}), and write a checkpoint ({@link #checkpoint}).
 *
 * <p>Ownership: every method loads the resume through the current user; another user's id is a 404,
 * indistinguishable from a missing one. Fields have one source of truth ({@code resume.label},
 * {@code resume.target}, {@code resume.is_default}, ...); the document repeats name and target as
 * server-written mirrors ({@link ResumeMetaMirror}). A rename or primary change moves the extension's
 * {@link ProfileVersion} (it hashes label and default flag); tags, target, creator and role do not.
 */
@Service
@Transactional
public class ResumeMetaService {

    public static final int MAX_NAME_CHARS = 200;
    public static final int MAX_TARGET_CHARS = 80;

    private final ResumeRepository resumeRepository;
    private final ResumeDocRepository resumeDocRepository;
    private final UserRepository userRepository;
    private final ProfileService profileService;
    private final ResumeActors actors;
    private final ResumeDocVersionService versions;
    private final ResumeLineageService lineageService;
    private final ResumeDocService docService;
    private final ResumeAccessService accessService;

    public ResumeMetaService(
        ResumeRepository resumeRepository,
        ResumeDocRepository resumeDocRepository,
        UserRepository userRepository,
        ProfileService profileService,
        ResumeActors actors,
        ResumeDocVersionService versions,
        ResumeLineageService lineageService,
        ResumeDocService docService,
        ResumeAccessService accessService
    ) {
        this.resumeRepository = resumeRepository;
        this.resumeDocRepository = resumeDocRepository;
        this.userRepository = userRepository;
        this.profileService = profileService;
        this.actors = actors;
        this.versions = versions;
        this.lineageService = lineageService;
        this.docService = docService;
        this.accessService = accessService;
    }

    // ---- read ---------------------------------------------------------------

    @Transactional(readOnly = true)
    public ResumeMetaDTO get(Long resumeId) {
        User user = currentUser();
        return build(owned(resumeId, user), user);
    }

    // ---- patch --------------------------------------------------------------

    /**
     * Apply a partial update. Only the fields present in {@code body} change; {@code target: null} (or
     * blank) clears the target. Validation (422 {@code META_INVALID}) runs before anything is written.
     */
    public ResumeMetaDTO patch(Long resumeId, JsonNode body) {
        User user = currentUser();
        Resume resume = owned(resumeId, user);
        if (body == null || !body.isObject()) {
            throw ResumeMetaException.invalid("$", "body must be an object");
        }

        String name = body.has("name") ? requireName(body.get("name")) : null;
        boolean setTarget = body.has("target");
        String target = setTarget ? requireTarget(body.get("target")) : null;
        List<String> tags = body.has("tags") ? requireTags(body.get("tags")) : null;
        Boolean primary = body.has("primary") ? requireBool(body, "primary") : null;
        Boolean starred = body.has("starred") ? requireBool(body, "starred") : null;
        Boolean archived = body.has("archived") ? requireBool(body, "archived") : null;
        Boolean shareWithOrg = body.has("shareWithOrg") ? requireBool(body, "shareWithOrg") : null;
        // R3.11: "visibility" accepts only PRIVATE (the one-call "stop sharing with people and the org"); people, links and
        // the org have their own controls. "recruiterSharing" is the on/off switch of the default share link.
        boolean makePrivate = body.has("visibility") && requirePrivate(body.get("visibility"));
        Boolean recruiterSharing = body.has("recruiterSharing") ? requireBool(body, "recruiterSharing") : null;

        boolean wasPrimary = Boolean.TRUE.equals(resume.getDefaultResume());
        boolean wasArchived = Boolean.TRUE.equals(resume.getArchived());
        boolean archivedAfter = archived != null ? archived : wasArchived;
        if (Boolean.TRUE.equals(primary) && archivedAfter) {
            throw ResumeMetaException.invalid("$.primary", "an archived resume cannot be primary");
        }
        if (Boolean.FALSE.equals(primary) && wasPrimary && !wasArchived) {
            throw ResumeMetaException.primaryRequired("Pick another resume as primary instead of unsetting this one");
        }
        if (Boolean.TRUE.equals(archived) && !wasArchived && wasPrimary && !Boolean.TRUE.equals(primary) && hasOtherLiveResume(resume, user)) {
            throw ResumeMetaException.primaryRequired("This is your primary resume: make another one primary before archiving it");
        }

        boolean nameChanged = name != null && !name.equals(resume.getLabel());
        boolean targetChanged = setTarget && !Objects.equals(target, resume.getTarget());
        if (name != null) resume.setLabel(name);
        if (setTarget) resume.setTarget(target);
        if (tags != null) resume.setTagsJson(ResumeTags.write(tags));
        if (starred != null) resume.setStarred(starred);
        if (shareWithOrg != null) resume.setShareWithOrg(shareWithOrg);
        if (archived != null) resume.setArchived(archived);
        if (Boolean.TRUE.equals(primary) && !wasPrimary) profileService.makePrimary(resume);
        resume.setUpdatedByLogin(user.getLogin());
        resumeRepository.saveAndFlush(resume);
        // Archiving/unarchiving can leave the user without (or with two) primaries: keep exactly one.
        profileService.ensurePrimary(user.getId());
        // R3.11 sharing switches: bulk updates that clear the persistence context, so they run on a fresh read, last.
        if (makePrivate) accessService.setVisibilityPrivate(resumeRepository.findById(resumeId).orElseThrow());
        if (recruiterSharing != null) accessService.setRecruiterSharing(resumeRepository.findById(resumeId).orElseThrow(), recruiterSharing);

        if ((nameChanged || targetChanged) && resume.getKind() == ResumeKind.BUILT) {
            mirrorIntoDocument(resume, user);
        }
        // mirrorIntoDocument clears the persistence context (bulk update), so build from a fresh read.
        return build(resumeRepository.findById(resumeId).orElseThrow(), user);
    }

    /** Write the resume's name/target into its stored document without ticking the document version. */
    private void mirrorIntoDocument(Resume resume, User user) {
        Optional<ResumeDoc> found = resumeDocRepository.findByResumeIdAndUserId(resume.getId(), user.getId());
        if (found.isEmpty()) return;
        ResumeDoc d = found.get();
        JsonNode doc = ResumeDocument.parse(d.getDocJson());
        if (ResumeMetaMirror.apply(doc, resume.getLabel(), resume.getTarget())) {
            String newHash = ResumeDocumentCanonical.contentHash(doc);
            // exported_hash is a RENDER hash (R3.7): carry it across the rename so a fresh PDF stays fresh.
            String oldRender = ResumeDocService.renderHash(d);
            String newRender = ResumeRenderHash.computeFromThemeJson(newHash, d.getTemplateId(), d.getThemeJson());
            resumeDocRepository.mirrorMeta(resume.getId(), ResumeDocumentJson.write(doc, 0), newHash, oldRender, newRender, Instant.now());
        }
    }

    private boolean hasOtherLiveResume(Resume resume, User user) {
        return resumeRepository
            .findByUserId(user.getId())
            .stream()
            .anyMatch(r -> !r.getId().equals(resume.getId()) && !Boolean.TRUE.equals(r.getArchived()));
    }

    private static String requireName(JsonNode n) {
        if (n == null || !n.isTextual()) throw ResumeMetaException.invalid("$.name", "must be a string");
        String name = n.textValue().strip();
        if (name.isEmpty()) throw ResumeMetaException.invalid("$.name", "must not be blank");
        if (name.length() > MAX_NAME_CHARS) throw ResumeMetaException.invalid("$.name", "must be at most " + MAX_NAME_CHARS + " characters");
        return name;
    }

    private static String requireTarget(JsonNode n) {
        if (n == null || n.isNull()) return null;
        if (!n.isTextual()) throw ResumeMetaException.invalid("$.target", "must be a string or null");
        String t = n.textValue().strip();
        if (t.length() > MAX_TARGET_CHARS) throw ResumeMetaException.invalid("$.target", "must be at most " + MAX_TARGET_CHARS + " characters");
        return t.isEmpty() ? null : t;
    }

    private static List<String> requireTags(JsonNode n) {
        if (n == null || n.isNull()) return List.of();
        if (!n.isArray()) throw ResumeMetaException.invalid("$.tags", "must be an array of strings");
        List<String> raw = new ArrayList<>();
        for (JsonNode t : n) {
            if (!t.isTextual()) throw ResumeMetaException.invalid("$.tags", "must be an array of strings");
            raw.add(t.textValue());
        }
        try {
            return ResumeTags.normalize(raw);
        } catch (ResumeTags.InvalidTagsException e) {
            throw ResumeMetaException.invalid("$.tags", e.getMessage());
        }
    }

    private static boolean requirePrivate(JsonNode n) {
        if (n == null || !n.isTextual() || !"PRIVATE".equals(n.textValue())) {
            throw ResumeMetaException.invalid("$.visibility", "only \"PRIVATE\" can be set here; share with people or a link from the Share menu");
        }
        return true;
    }

    private static Boolean requireBool(JsonNode body, String field) {
        JsonNode n = body.get(field);
        if (n == null || !n.isBoolean()) throw ResumeMetaException.invalid("$." + field, "must be true or false");
        return n.booleanValue();
    }

    // ---- lineage ------------------------------------------------------------

    @Transactional(readOnly = true)
    public ResumeLineageDTO lineage(Long resumeId) {
        User user = currentUser();
        Resume resume = owned(resumeId, user);
        ResumeDoc doc = docOf(resume, user);
        Resume master = masterOf(resume, doc, user);
        ResumeDoc masterDoc = master.getId().equals(resume.getId()) ? doc : docOf(master, user);
        List<ResumeLineageDTO.Child> children = new ArrayList<>();
        for (ResumeDoc c : resumeDocRepository.findByUserIdAndParentResumeId(user.getId(), master.getId())) {
            Resume child = c.getResume();
            if (child.getRole() != ResumeRole.TAILORED) continue;
            children.add(new ResumeLineageDTO.Child(child.getId(), child.getLabel(), null, child.getUpdatedAt(), masterChanged(c, masterDoc)));
        }
        children.sort((a, b) -> a.id().compareTo(b.id()));
        return new ResumeLineageDTO(
            new ResumeLineageDTO.Master(master.getId(), master.getLabel(), master.getUpdatedAt()),
            children,
            resume.getRole().name()
        );
    }

    /** Cut a tailored resume loose from its master: it becomes a master (409 {@code NOT_TAILORED} otherwise). */
    public ResumeMetaDTO detach(Long resumeId) {
        User user = currentUser();
        Resume resume = owned(resumeId, user);
        ResumeDoc doc = docOf(resume, user);
        if (doc == null || resume.getRole() != ResumeRole.TAILORED) {
            throw ResumeMetaException.notTailored();
        }
        lineageService.detach(doc, user.getLogin());
        return build(resumeRepository.findById(resumeId).orElseThrow(), user);
    }

    private Resume masterOf(Resume resume, ResumeDoc doc, User user) {
        if (resume.getRole() == ResumeRole.TAILORED && doc != null && doc.getParentResumeId() != null) {
            Resume parent = resumeRepository.findById(doc.getParentResumeId()).orElse(null);
            if (parent != null && parent.getUser() != null && parent.getUser().getId().equals(user.getId())) return parent;
        }
        return resume;
    }

    private static boolean masterChanged(ResumeDoc child, ResumeDoc master) {
        return child.getParentHashAtCopy() != null && master != null && !child.getParentHashAtCopy().equals(master.getContentHash());
    }

    // ---- checkpoint and versions -------------------------------------------

    /** Result of {@link #checkpoint}: the new version number and reason, and the PDF state to poll. */
    public record Checkpoint(int versionNo, String reason, ResumeMetaDTO.Pdf pdf) {}

    /**
     * Write a version row now: MANUAL, or NAMED when {@code name} is given (at most 80 characters, else 422).
     * The client flushes its autosave first, so the row snapshots what the user sees.
     */
    public Checkpoint checkpoint(Long resumeId, String name) {
        User user = currentUser();
        Resume resume = owned(resumeId, user);
        ResumeDoc doc = docOf(resume, user);
        if (doc == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume document not found");
        }
        ResumeDocVersion v = versions.checkpoint(doc, name, user.getLogin());
        // R3.7 (async PDF): an explicit Save asks for the PDF now, with no settle delay (markPdfPending(doc, immediate)).
        // Done as a bulk update so doc_version does not tick: the editor's next autosave keeps a valid If-Match.
        docService.requestPdfImmediately(doc);
        ResumeDoc fresh = docOf(resume, user);
        return new Checkpoint(v.getVersionNo(), v.getReason(), pdfOf(resume, fresh));
    }

    @Transactional(readOnly = true)
    public List<ResumeVersionDTO> versions(Long resumeId) {
        User user = currentUser();
        Resume resume = owned(resumeId, user);
        requireDoc(resume, user);
        return versions.rows(resume.getId(), user.getId(), user.getLogin());
    }

    @Transactional(readOnly = true)
    public String versionText(Long resumeId, int versionNo) {
        User user = currentUser();
        Resume resume = owned(resumeId, user);
        requireDoc(resume, user);
        return versions
            .text(resume.getId(), user.getId(), versionNo)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Version not found"));
    }

    private void requireDoc(Resume resume, User user) {
        if (docOf(resume, user) == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume document not found");
        }
    }

    // ---- building the DTO ---------------------------------------------------

    private ResumeMetaDTO build(Resume r, User user) {
        ResumeDoc d = docOf(r, user);
        boolean built = r.getKind() == ResumeKind.BUILT && d != null;
        boolean archived = Boolean.TRUE.equals(r.getArchived());

        Set<String> logins = new java.util.HashSet<>();
        if (r.getCreatedByLogin() != null) logins.add(r.getCreatedByLogin());
        if (r.getUpdatedByLogin() != null) logins.add(r.getUpdatedByLogin());
        var by = actors.resolve(logins);
        ResumeActorDTO createdBy = r.getCreatedByLogin() == null ? null : by.get(r.getCreatedByLogin());
        ResumeActorDTO updatedBy = r.getUpdatedByLogin() == null ? null : by.get(r.getUpdatedByLogin());

        boolean hasCheckpoint = built && versions.hasCheckpoint(r.getId(), user.getId());
        String lifecycle = ResumeLifecycle.of(r.getArchived(), r.getKind(), hasCheckpoint, built ? d.getExportedAt() : null);

        ResumeMetaDTO.Source source = sourceOf(r, d, built, user, createdBy);
        Resume master = built ? masterOf(r, d, user) : r;
        ResumeDoc masterDoc = !built ? null : master.getId().equals(r.getId()) ? d : docOf(master, user);
        int children = built && r.getRole() == ResumeRole.MASTER ? (int) resumeDocRepository.countTailoredChildren(user.getId(), r.getId()) : 0;
        ResumeMetaDTO.Lineage lineage = new ResumeMetaDTO.Lineage(
            master.getId(),
            master.getLabel(),
            built && r.getRole() == ResumeRole.TAILORED && masterChanged(d, masterDoc),
            children
        );

        boolean shareWithOrg = !Boolean.FALSE.equals(r.getShareWithOrg());
        ResumeAccessService.Summary sharing = accessService.summary(r);
        ResumeMetaDTO.Visibility visibility = new ResumeMetaDTO.Visibility(
            visibilityMode(sharing.people(), shareWithOrg, sharing.orgScope()),
            sharing.orgPaired(),
            sharing.orgScope(),
            shareWithOrg,
            sharing.people()
        );

        ResumeMetaDTO.VersionInfo version = new ResumeMetaDTO.VersionInfo(0, null);
        if (built) {
            Optional<ResumeDocVersion> latest = versions.latest(r.getId(), user.getId());
            if (latest.isPresent()) {
                ResumeDocVersion v = latest.get();
                version = new ResumeMetaDTO.VersionInfo(
                    v.getVersionNo(),
                    new ResumeMetaDTO.LatestVersion(v.getName(), v.getCreatedAt(), ResumeDocVersionService.kindOf(v.getReason()))
                );
            }
        }

        return new ResumeMetaDTO(
            r.getId(),
            r.getLabel(),
            r.getKind(),
            source,
            r.getTarget(),
            ResumeTags.parse(r.getTagsJson()),
            Boolean.TRUE.equals(r.getDefaultResume()),
            Boolean.TRUE.equals(r.getStarred()),
            archived,
            lifecycle,
            r.getRole(),
            built ? d.getTemplateId() : null,
            r.getCreatedAt(),
            createdBy,
            r.getUpdatedAt(),
            updatedBy,
            built ? d.getExportedAt() : null,
            built ? d.getScore() : null,
            pdfOf(r, d),
            shareWithOrg,
            lineage,
            visibility,
            new ResumeMetaDTO.RecruiterSharing(sharing.links() > 0, sharing.links(), sharing.linkViews()),
            version
        );
    }

    /**
     * Visibility is derived, never stored (DESIGN 9.11): PEOPLE when at least one active person grant
     * exists; else ORG when the resume is shared with the organisation <em>and</em> the member's pairing
     * scope is FULL; else PRIVATE. Without the org area's consent record the scope is null, so ORG never shows.
     */
    static String visibilityMode(int people, boolean shareWithOrg, String orgScope) {
        if (people >= 1) return "PEOPLE";
        if (shareWithOrg && "FULL".equals(orgScope)) return "ORG";
        return "PRIVATE";
    }

    private ResumeMetaDTO.Source sourceOf(Resume r, ResumeDoc d, boolean built, User owner, ResumeActorDTO createdBy) {
        String origin = built ? d.getSourceKind() : null;
        ResumeMetaDTO.TailoredFrom tailoredFrom = null;
        if (built && r.getRole() == ResumeRole.TAILORED && d.getParentResumeId() != null) {
            Resume parent = resumeRepository.findById(d.getParentResumeId()).orElse(null);
            if (parent != null && parent.getUser() != null && parent.getUser().getId().equals(owner.getId())) {
                tailoredFrom = new ResumeMetaDTO.TailoredFrom(parent.getId(), parent.getLabel(), null);
            }
        }
        // A resume made by someone else (a marketer, Phase 22) names them; approval is theirs to add later.
        String madeBy = createdBy != null && !createdBy.login().equals(owner.getLogin()) ? createdBy.label() : null;
        return new ResumeMetaDTO.Source(r.getKind().name(), origin, tailoredFrom, madeBy, false, null);
    }

    /** The PDF the resume has stored: built resumes by the async pipeline's real status (R3.7), uploaded ones by the file they carry. */
    private static ResumeMetaDTO.Pdf pdfOf(Resume r, ResumeDoc d) {
        if (r.getKind() == ResumeKind.BUILT && d != null) {
            ResumePdfDTO p = ResumePdfState.toDto(
                d.getPdfStatus(),
                d.getExportedHash(),
                d.getExportedAt(),
                ResumeDocService.renderHash(d),
                d.getPdfAttempts(),
                d.getPdfError()
            );
            return new ResumeMetaDTO.Pdf(p.getStatus(), p.getHash(), p.getGeneratedAt(), p.getAttempts(), p.getError());
        }
        boolean hasFile = r.getr2ObjectKey() != null && !r.getr2ObjectKey().isBlank();
        return new ResumeMetaDTO.Pdf(hasFile ? "READY" : "NONE", null, null, 0, null);
    }

    // ---- helpers ------------------------------------------------------------

    private ResumeDoc docOf(Resume resume, User user) {
        if (resume.getKind() != ResumeKind.BUILT) return null;
        return resumeDocRepository.findByResumeIdAndUserId(resume.getId(), user.getId()).orElse(null);
    }

    /** The resume if it is the current user's; 404 otherwise (no leak). */
    private Resume owned(Long id, User user) {
        Resume resume = id == null ? null : resumeRepository.findById(id).orElse(null);
        if (resume == null || resume.getUser() == null || !resume.getUser().getId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume not found");
        }
        return resume;
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return userRepository.findOneByLogin(login).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found")
        );
    }
}
