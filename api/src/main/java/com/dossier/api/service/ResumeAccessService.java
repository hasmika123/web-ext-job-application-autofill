package com.dossier.api.service;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeAccess;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.ResumeViewEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.repository.ResumeAccessRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.ResumeViewEventRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.ResumeAccessDTOs.AccessGrantDTO;
import com.dossier.api.service.dto.ResumeAccessDTOs.OrgAccessDTO;
import com.dossier.api.service.dto.ResumeAccessDTOs.PublicResumeDTO;
import com.dossier.api.service.dto.ResumeAccessDTOs.ResumeAccessOverviewDTO;
import com.dossier.api.service.dto.ResumeAccessDTOs.ResumeViewDTO;
import com.dossier.api.service.dto.ResumeAccessDTOs.SharedResumeDTO;
import com.dossier.api.service.dto.ResumeActorDTO;
import com.dossier.api.service.dto.ResumeDocDTO;
import com.dossier.api.service.privacy.SensitiveContent;
import com.dossier.api.service.resume.OrgResumeSharing;
import com.dossier.api.service.resume.ResumePdfState;
import com.dossier.api.service.resume.ResumePublicView;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.FileStorage.StoredFile;
import com.dossier.api.service.storage.StorageObjectNotFoundException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who may read a resume, and everything that changes it (Resume Builder R3.11, DESIGN 8.7). A resume is
 * private by default; exactly four kinds of subject can read it, and {@link #access} is the one place that
 * decides:
 *
 * <ol>
 *   <li>the owner;</li>
 *   <li>a Kiwiply account holding an active {@code USER} grant;</li>
 *   <li>the owner's paired marketer, only while the member's consent scope is {@code FULL} and the resume's
 *       {@code share_with_org} flag is on (read through the optional {@link OrgResumeSharing} seam; without
 *       it no org ever reads anything);</li>
 *   <li>anyone holding an active {@code LINK} token, through the public routes only.</li>
 * </ol>
 *
 * Every refusal toward a non-owner is a plain 404 - a resume you cannot read looks exactly like one that does
 * not exist, so ids and tokens cannot be probed. Every non-owner read writes a {@code resume_view_event}; a
 * link viewer is anonymous (no login, no IP, no user agent is stored). All limits, defaults and switches are
 * {@link ResumeBuilderSettings} values.
 */
@Service
@Transactional
public class ResumeAccessService {

    public static final int MAX_LABEL_CHARS = 80;
    private static final int TOKEN_CHARS = 32;
    private static final String BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private static final int VIEWS_MAX = 200;
    private static final int VIEWS_DEFAULT = 50;

    /** Why a viewer may read a resume. */
    public enum Via {
        OWNER,
        USER,
        ORG,
    }

    /** A viewer's right to read one resume; {@code grantId} is set for {@code USER} grants. */
    public record Access(Via via, Long grantId) {}

    /** The numbers the metadata object needs. {@code orgScope} / {@code orgPaired} are null without the org seam. */
    public record Summary(int people, int links, int linkViews, String orgScope, String orgPaired) {}

    /** A stored PDF ready to stream. */
    public record PdfFile(StoredFile file, String name) {}

    private final ResumeRepository resumeRepository;
    private final ResumeDocRepository resumeDocRepository;
    private final ResumeAccessRepository accessRepository;
    private final ResumeViewEventRepository viewRepository;
    private final UserRepository userRepository;
    private final ResumeBuilderSettings settings;
    private final ResumeActors actors;
    private final FileStorage storage;
    private final ResumeDocService docService;
    private final ObjectProvider<OrgResumeSharing> orgSharing;
    private final String webBaseUrl;
    private final SecureRandom random = new SecureRandom();

    public ResumeAccessService(
        ResumeRepository resumeRepository,
        ResumeDocRepository resumeDocRepository,
        ResumeAccessRepository accessRepository,
        ResumeViewEventRepository viewRepository,
        UserRepository userRepository,
        ResumeBuilderSettings settings,
        ResumeActors actors,
        FileStorage storage,
        ResumeDocService docService,
        ObjectProvider<OrgResumeSharing> orgSharing,
        @Value("${jhipster.mail.base-url:}") String webBaseUrl
    ) {
        this.resumeRepository = resumeRepository;
        this.resumeDocRepository = resumeDocRepository;
        this.accessRepository = accessRepository;
        this.viewRepository = viewRepository;
        this.userRepository = userRepository;
        this.settings = settings;
        this.actors = actors;
        this.storage = storage;
        this.docService = docService;
        this.orgSharing = orgSharing;
        this.webBaseUrl = webBaseUrl == null ? "" : webBaseUrl.replaceAll("/+$", "");
    }

    // =====================================================================================================
    // Who can read
    // =====================================================================================================

    /** Whether {@code viewerLogin} may read the resume: owner, an active USER grant, or an org FULL pairing. */
    @Transactional(readOnly = true)
    public boolean canRead(Long resumeId, String viewerLogin) {
        return access(resumeId, viewerLogin).isPresent();
    }

    /** How {@code viewerLogin} may read the resume, in the order owner, USER grant, org FULL pairing; empty when not at all. */
    @Transactional(readOnly = true)
    public Optional<Access> access(Long resumeId, String viewerLogin) {
        if (resumeId == null || viewerLogin == null || viewerLogin.isBlank()) return Optional.empty();
        Resume resume = resumeRepository.findById(resumeId).orElse(null);
        if (resume == null || resume.getUser() == null) return Optional.empty();
        String ownerLogin = resume.getUser().getLogin();
        if (viewerLogin.equals(ownerLogin)) return Optional.of(new Access(Via.OWNER, null));

        Instant now = Instant.now();
        for (ResumeAccess g : accessRepository.findByResumeIdAndSubjectTypeAndSubjectLoginAndRevokedAtIsNull(resumeId, ResumeAccess.SUBJECT_USER, viewerLogin)) {
            if (g.isActive(now)) return Optional.of(new Access(Via.USER, g.getId()));
        }
        OrgResumeSharing org = orgSharing.getIfAvailable();
        if (org != null && !Boolean.FALSE.equals(resume.getShareWithOrg()) && org.isFullPairedViewer(ownerLogin, viewerLogin)) {
            return Optional.of(new Access(Via.ORG, null));
        }
        return Optional.empty();
    }

    // =====================================================================================================
    // Owner: grants, links, views
    // =====================================================================================================

    @Transactional(readOnly = true)
    public ResumeAccessOverviewDTO overview(Long resumeId) {
        User user = currentUser();
        Resume resume = owned(resumeId, user);
        Instant now = Instant.now();
        List<ResumeAccess> rows = accessRepository.findByResumeIdAndRevokedAtIsNullOrderByCreatedAtAscIdAsc(resumeId);
        Set<String> logins = new HashSet<>();
        for (ResumeAccess a : rows) if (a.getSubjectLogin() != null) logins.add(a.getSubjectLogin());
        Map<String, ResumeActorDTO> by = actors.resolve(logins);
        List<AccessGrantDTO> grants = new ArrayList<>();
        List<AccessGrantDTO> links = new ArrayList<>();
        for (ResumeAccess a : rows) {
            (a.isLink() ? links : grants).add(toDto(a, now, by));
        }
        return new ResumeAccessOverviewDTO(orgOf(resume, user), grants, links, viewRepository.countByResumeId(resumeId));
    }

    public AccessGrantDTO grantUser(Long resumeId, String email, String role, Instant expiresAt, String label) {
        User user = currentUser();
        Resume resume = owned(resumeId, user);
        requireShareable(resume);
        if (role != null && !role.isBlank() && !ResumeAccess.ROLE_VIEW.equalsIgnoreCase(role.trim())) {
            throw ResumeAccessException.roleNotAvailable();
        }
        String normalised = email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
        if (normalised.isEmpty() || normalised.length() > 254 || !normalised.contains("@")) {
            throw ResumeAccessException.invalid("$.email", "must be an email address");
        }
        String cleanLabel = cleanLabel(label);
        Instant now = Instant.now();
        requireFuture(expiresAt, now);

        User grantee = userRepository.findOneByEmailIgnoreCase(normalised).filter(User::isActivated).orElseThrow(ResumeAccessException::userNotFound);
        if (grantee.getLogin().equals(user.getLogin())) {
            throw ResumeAccessException.invalid("$.email", "this is your own resume");
        }
        for (ResumeAccess g : accessRepository.findByResumeIdAndSubjectTypeAndSubjectLoginAndRevokedAtIsNull(resumeId, ResumeAccess.SUBJECT_USER, grantee.getLogin())) {
            if (g.isActive(now)) throw ResumeAccessException.alreadyGranted();
        }
        int max = settings.getInt(ResumeBuilderSettingKeys.SHARE_MAX_GRANTS);
        if (accessRepository.countActive(resumeId, ResumeAccess.SUBJECT_USER, now) >= max) {
            throw ResumeAccessException.limit("people", max);
        }

        ResumeAccess a = newGrant(resume, user, ResumeAccess.SUBJECT_USER, now);
        a.setSubjectLogin(grantee.getLogin());
        a.setExpiresAt(expiresAt);
        a.setLabel(cleanLabel);
        accessRepository.saveAndFlush(a);
        return toDto(a, now, actors.resolve(Set.of(grantee.getLogin())));
    }

    public AccessGrantDTO createLink(Long resumeId, Instant expiresAt, String label, Boolean allowDownload) {
        User user = currentUser();
        Resume resume = owned(resumeId, user);
        return toDto(newLink(resume, user, expiresAt, label, allowDownload), Instant.now(), Map.of());
    }

    /** Revoke a grant of this resume. Idempotent; an id that is not a grant of this (owned) resume is a 404. */
    public void revoke(Long resumeId, Long accessId) {
        User user = currentUser();
        owned(resumeId, user);
        ResumeAccess a = accessRepository.findByIdAndResumeId(accessId, resumeId).orElseThrow(ResumeAccessService::notFound);
        if (a.getRevokedAt() == null) {
            a.setRevokedAt(Instant.now());
            accessRepository.saveAndFlush(a);
        }
    }

    @Transactional(readOnly = true)
    public List<ResumeViewDTO> views(Long resumeId, Integer limit) {
        User user = currentUser();
        owned(resumeId, user);
        int n = limit == null ? VIEWS_DEFAULT : Math.max(1, Math.min(VIEWS_MAX, limit));
        List<ResumeViewEvent> events = viewRepository.findByResumeIdOrderByViewedAtDescIdDesc(resumeId, PageRequest.of(0, n));
        Set<String> logins = new HashSet<>();
        Set<Long> accessIds = new HashSet<>();
        for (ResumeViewEvent e : events) {
            if (e.getViewerLogin() != null) logins.add(e.getViewerLogin());
            if (e.getAccessId() != null) accessIds.add(e.getAccessId());
        }
        Map<String, ResumeActorDTO> by = actors.resolve(logins);
        Map<Long, ResumeAccess> grants = new HashMap<>();
        for (ResumeAccess a : accessRepository.findAllById(accessIds)) grants.put(a.getId(), a);
        List<ResumeViewDTO> out = new ArrayList<>();
        for (ResumeViewEvent e : events) {
            out.add(new ResumeViewDTO(e.getViewerKind(), viewerLabel(e, by, grants), e.getWhat(), e.getViewedAt()));
        }
        return out;
    }

    // ---- driven by PATCH …/meta (the caller has already proven ownership) -------------------------------

    /** "Shared with Recruiters" on/off: on creates the default link when none is active; off revokes every link. */
    public void setRecruiterSharing(Resume resume, boolean on) {
        Instant now = Instant.now();
        if (on) {
            boolean anyActive = accessRepository
                .findByResumeIdAndRevokedAtIsNullOrderByCreatedAtAscIdAsc(resume.getId())
                .stream()
                .anyMatch(a -> a.isLink() && a.isActive(now));
            if (!anyActive) newLink(resume, resume.getUser(), null, null, null);
        } else {
            accessRepository.revokeAll(resume.getId(), ResumeAccess.SUBJECT_LINK, now);
        }
    }

    /** Visibility "Private": every person grant is revoked and the resume leaves the org (links are separate). */
    public void setVisibilityPrivate(Resume resume) {
        resume.setShareWithOrg(false);
        resumeRepository.saveAndFlush(resume);
        accessRepository.revokeAll(resume.getId(), ResumeAccess.SUBJECT_USER, Instant.now());
    }

    /** The numbers behind the metadata object's {@code visibility} and {@code recruiterSharing}. */
    @Transactional(readOnly = true)
    public Summary summary(Resume resume) {
        Instant now = Instant.now();
        int people = 0;
        int links = 0;
        int views = 0;
        for (ResumeAccess a : accessRepository.findByResumeIdAndRevokedAtIsNullOrderByCreatedAtAscIdAsc(resume.getId())) {
            if (!a.isActive(now)) continue;
            if (a.isLink()) {
                links++;
                views += a.getViewCount();
            } else {
                people++;
            }
        }
        OrgResumeSharing.Pairing pairing = pairingOf(resume);
        return new Summary(people, links, views, pairing == null ? null : pairing.scope(), pairing == null ? null : pairing.pairedWith());
    }

    // =====================================================================================================
    // Signed-in viewers: shared with me
    // =====================================================================================================

    @Transactional(readOnly = true)
    public List<SharedResumeDTO> sharedWithMe() {
        String me = currentLogin();
        Instant now = Instant.now();
        List<SharedResumeDTO> out = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (ResumeAccess g : accessRepository.findBySubjectTypeAndSubjectLoginAndRevokedAtIsNull(ResumeAccess.SUBJECT_USER, me)) {
            if (!g.isActive(now) || !seen.add(g.getResumeId())) continue;
            resumeRepository
                .findById(g.getResumeId())
                .filter(r -> r.getKind() == ResumeKind.BUILT)
                .ifPresent(r -> out.add(new SharedResumeDTO(r.getId(), r.getLabel(), ownerLabel(r), g.getRole(), "USER")));
        }
        OrgResumeSharing org = orgSharing.getIfAvailable();
        if (org != null) {
            for (String ownerLogin : org.ownersSharingFullWith(me)) {
                User owner = userRepository.findOneByLogin(ownerLogin).orElse(null);
                if (owner == null) continue;
                for (Resume r : resumeRepository.findByUserId(owner.getId())) {
                    boolean visible = r.getKind() == ResumeKind.BUILT && !Boolean.FALSE.equals(r.getShareWithOrg()) && !Boolean.TRUE.equals(r.getArchived());
                    if (visible && seen.add(r.getId())) out.add(new SharedResumeDTO(r.getId(), r.getLabel(), ownerLabel(r), ResumeAccess.ROLE_VIEW, "ORG"));
                }
            }
        }
        return out;
    }

    /** The document for a signed-in non-owner (USER / ORG), read-only and scrubbed; 404 for anyone else. Records the view. */
    public ResumeDocDTO sharedDoc(Long resumeId) {
        String me = currentLogin();
        Access a = access(resumeId, me).orElseThrow(ResumeAccessService::notFound);
        Resume resume = resumeRepository.findById(resumeId).orElseThrow(ResumeAccessService::notFound);
        if (resume.getKind() != ResumeKind.BUILT) throw notFound();
        ResumeDocDTO dto = docService.getForViewer(resumeId);
        dto.setDoc(ResumePublicView.scrub(dto.getDoc()));
        dto.setPdf(null);
        dto.setRenderHash(null);
        dto.setContentHash(null);
        dto.setExportedHash(null);
        dto.setExportedAt(null);
        dto.setProfileSyncedAt(null);
        if (a.via() != Via.OWNER) recordView(resume, a.via() == Via.ORG ? ResumeViewEvent.KIND_ORG : ResumeViewEvent.KIND_USER, me, a.grantId(), ResumeViewEvent.WHAT_PAGE);
        return dto;
    }

    /** The stored PDF for a signed-in non-owner; 409 {@code PDF_NOT_READY} when it is not current. Records the view. */
    public PdfFile sharedPdf(Long resumeId) {
        String me = currentLogin();
        Access a = access(resumeId, me).orElseThrow(ResumeAccessService::notFound);
        Resume resume = resumeRepository.findById(resumeId).orElseThrow(ResumeAccessService::notFound);
        PdfFile pdf = currentPdf(resume);
        if (a.via() != Via.OWNER) recordView(resume, a.via() == Via.ORG ? ResumeViewEvent.KIND_ORG : ResumeViewEvent.KIND_USER, me, a.grantId(), ResumeViewEvent.WHAT_PDF);
        return pdf;
    }

    // =====================================================================================================
    // Anyone with the link (no login)
    // =====================================================================================================

    /** Whether the token names an active link on a shareable resume (used by the rate limiter's miss bucket). */
    @Transactional(readOnly = true)
    public boolean linkExists(String token) {
        return resolveLink(token).isPresent();
    }

    /** What a link opens: the page content. A LINK view event is written. 404 for an unknown, revoked or expired link. */
    public PublicResumeDTO publicView(String token) {
        ResumeAccess link = resolveLink(token).orElseThrow(ResumeAccessService::notFound);
        Resume resume = resumeRepository.findById(link.getResumeId()).orElseThrow(ResumeAccessService::notFound);
        ResumeDoc doc = resumeDocRepository.findById(resume.getId()).orElseThrow(ResumeAccessService::notFound);
        ResumeDocDTO dto = docService.getForViewer(resume.getId());
        recordView(resume, ResumeViewEvent.KIND_LINK, null, link.getId(), ResumeViewEvent.WHAT_PAGE);
        return new PublicResumeDTO(
            resume.getLabel(),
            ResumePublicView.scrub(dto.getDoc()),
            doc.getTemplateId(),
            dto.getTheme(),
            link.isAllowDownload(),
            isPdfCurrent(doc)
        );
    }

    /** The stored PDF through a link that allows download; 404 when it does not, 409 {@code PDF_NOT_READY} when it is not current. */
    public PdfFile publicPdf(String token) {
        ResumeAccess link = resolveLink(token).orElseThrow(ResumeAccessService::notFound);
        if (!link.isAllowDownload()) throw notFound();
        Resume resume = resumeRepository.findById(link.getResumeId()).orElseThrow(ResumeAccessService::notFound);
        PdfFile pdf = currentPdf(resume);
        recordView(resume, ResumeViewEvent.KIND_LINK, null, link.getId(), ResumeViewEvent.WHAT_PDF);
        return pdf;
    }

    // =====================================================================================================
    // Internals
    // =====================================================================================================

    /** Write the audit row (and count the view on the grant); ORG reads also go to the org audit. */
    void recordView(Resume resume, String kind, String viewerLogin, Long accessId, String what) {
        Instant now = Instant.now();
        ResumeViewEvent e = new ResumeViewEvent();
        e.setResumeId(resume.getId());
        e.setOwnerUserId(resume.getUser().getId());
        e.setViewerKind(kind);
        e.setViewerLogin(ResumeViewEvent.KIND_LINK.equals(kind) ? null : viewerLogin); // a link viewer is anonymous
        e.setAccessId(accessId);
        e.setWhat(what);
        e.setViewedAt(now);
        viewRepository.saveAndFlush(e);
        if (accessId != null && ResumeViewEvent.WHAT_PAGE.equals(what)) accessRepository.countView(accessId, now);
        if (ResumeViewEvent.KIND_ORG.equals(kind)) {
            OrgResumeSharing org = orgSharing.getIfAvailable();
            if (org != null) org.auditFullRead(resume.getUser().getLogin(), viewerLogin, resume.getId());
        }
    }

    private Optional<ResumeAccess> resolveLink(String token) {
        if (token == null || token.length() != TOKEN_CHARS || !settings.getBool(ResumeBuilderSettingKeys.FEATURE_SHARE_LINKS)) return Optional.empty();
        return accessRepository
            .findByToken(token)
            .filter(a -> a.isLink() && a.isActive(Instant.now()))
            .filter(a -> resumeRepository.findById(a.getResumeId()).filter(r -> r.getKind() == ResumeKind.BUILT).isPresent());
    }

    private ResumeAccess newLink(Resume resume, User owner, Instant expiresAt, String label, Boolean allowDownload) {
        requireShareable(resume);
        if (!settings.getBool(ResumeBuilderSettingKeys.FEATURE_SHARE_LINKS)) throw ResumeAccessException.featureDisabled();
        String cleanLabel = cleanLabel(label);
        Instant now = Instant.now();
        requireFuture(expiresAt, now);
        int max = settings.getInt(ResumeBuilderSettingKeys.SHARE_MAX_LINKS);
        if (accessRepository.countActive(resume.getId(), ResumeAccess.SUBJECT_LINK, now) >= max) {
            throw ResumeAccessException.limit("links", max);
        }
        int days = settings.getInt(ResumeBuilderSettingKeys.SHARE_LINK_DEFAULT_DAYS);
        ResumeAccess a = newGrant(resume, owner, ResumeAccess.SUBJECT_LINK, now);
        a.setToken(newToken());
        a.setLabel(cleanLabel);
        a.setExpiresAt(expiresAt != null ? expiresAt : days > 0 ? now.plus(days, ChronoUnit.DAYS) : null);
        a.setAllowDownload(allowDownload != null ? allowDownload : settings.getBool(ResumeBuilderSettingKeys.SHARE_ALLOW_DOWNLOAD_DEFAULT));
        return accessRepository.saveAndFlush(a);
    }

    private static ResumeAccess newGrant(Resume resume, User owner, String type, Instant now) {
        ResumeAccess a = new ResumeAccess();
        a.setResumeId(resume.getId());
        a.setOwnerUserId(owner.getId());
        a.setSubjectType(type);
        a.setRole(ResumeAccess.ROLE_VIEW);
        a.setCreatedAt(now);
        a.setCreatedByLogin(owner.getLogin());
        return a;
    }

    /** 32 base62 characters from the system CSPRNG. */
    private String newToken() {
        StringBuilder sb = new StringBuilder(TOKEN_CHARS);
        for (int i = 0; i < TOKEN_CHARS; i++) sb.append(BASE62.charAt(random.nextInt(BASE62.length())));
        return sb.toString();
    }

    private AccessGrantDTO toDto(ResumeAccess a, Instant now, Map<String, ResumeActorDTO> by) {
        boolean link = a.isLink();
        ResumeActorDTO actor = a.getSubjectLogin() == null ? null : by.get(a.getSubjectLogin());
        return new AccessGrantDTO(
            a.getId(),
            a.getSubjectType(),
            link ? null : a.getSubjectLogin(),
            link ? null : actor != null ? actor.label() : a.getSubjectLogin(),
            a.getRole(),
            a.getLabel(),
            link ? a.isAllowDownload() : null,
            a.getExpiresAt(),
            !a.isActive(now),
            a.getCreatedAt(),
            a.getViewCount(),
            a.getLastViewedAt(),
            link ? webBaseUrl + "/r/" + a.getToken() : null
        );
    }

    private String viewerLabel(ResumeViewEvent e, Map<String, ResumeActorDTO> by, Map<Long, ResumeAccess> grants) {
        ResumeActorDTO who = e.getViewerLogin() == null ? null : by.get(e.getViewerLogin());
        String name = who != null ? who.label() : e.getViewerLogin();
        return switch (e.getViewerKind()) {
            case ResumeViewEvent.KIND_ORG -> name + " (your marketer)";
            case ResumeViewEvent.KIND_LINK -> {
                ResumeAccess g = e.getAccessId() == null ? null : grants.get(e.getAccessId());
                yield g != null && g.getLabel() != null ? "Link: " + g.getLabel() : "Link";
            }
            default -> name;
        };
    }

    private OrgAccessDTO orgOf(Resume resume, User owner) {
        OrgResumeSharing.Pairing p = pairingOf(resume);
        return p == null ? null : new OrgAccessDTO(p.scope(), p.pairedWith(), !Boolean.FALSE.equals(resume.getShareWithOrg()));
    }

    private OrgResumeSharing.Pairing pairingOf(Resume resume) {
        OrgResumeSharing org = orgSharing.getIfAvailable();
        if (org == null || resume.getUser() == null) return null;
        return org.pairingOf(resume.getUser().getLogin()).orElse(null);
    }

    /** The stored PDF of a built resume if it is current (READY and made from the document as it is now). */
    private PdfFile currentPdf(Resume resume) {
        ResumeDoc doc = resumeDocRepository.findById(resume.getId()).orElseThrow(ResumeAccessService::notFound);
        String key = resume.getr2ObjectKey();
        if (!isPdfCurrent(doc) || key == null || key.isBlank()) throw ResumeAccessException.pdfNotReady();
        try {
            return new PdfFile(storage.load(key), resume.getLabel());
        } catch (StorageObjectNotFoundException e) {
            throw ResumeAccessException.pdfNotReady();
        }
    }

    private static boolean isPdfCurrent(ResumeDoc d) {
        return ResumePdfState.READY.equals(
            ResumePdfState.toDto(d.getPdfStatus(), d.getExportedHash(), d.getExportedAt(), ResumeDocService.renderHash(d), d.getPdfAttempts(), d.getPdfError()).getStatus()
        );
    }

    private static void requireShareable(Resume resume) {
        if (resume.getKind() != ResumeKind.BUILT) throw ResumeAccessException.notShareable();
    }

    private static void requireFuture(Instant expiresAt, Instant now) {
        if (expiresAt != null && !expiresAt.isAfter(now)) throw ResumeAccessException.invalid("$.expiresAt", "must be in the future");
    }

    private static String cleanLabel(String label) {
        if (label == null) return null;
        String l = label.strip();
        if (l.isEmpty()) return null;
        if (l.length() > MAX_LABEL_CHARS) throw ResumeAccessException.invalid("$.label", "must be at most " + MAX_LABEL_CHARS + " characters");
        SensitiveContent.check("$.label", "label", l); // never collected, even in a note to yourself
        return l;
    }

    private String ownerLabel(Resume r) {
        ResumeActorDTO a = r.getUser() == null ? null : actors.of(r.getUser().getLogin());
        return a == null ? "" : a.label();
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found");
    }

    /** The resume if it is the current user's; 404 otherwise (no leak). */
    private Resume owned(Long id, User user) {
        Resume resume = id == null ? null : resumeRepository.findById(id).orElse(null);
        if (resume == null || resume.getUser() == null || !resume.getUser().getId().equals(user.getId())) throw notFound();
        return resume;
    }

    private static String currentLogin() {
        return SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
    }

    private User currentUser() {
        return userRepository.findOneByLogin(currentLogin()).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }
}
