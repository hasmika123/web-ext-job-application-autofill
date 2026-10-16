package com.dossier.api.service.ent.mkt.resumes;

import com.dossier.api.domain.Bio;
import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktResumeRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ResumeDocService;
import com.dossier.api.service.dto.BuiltResumeDTO;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.resumes.MktResumeBuilderDto.NewResumeConsultant;
import com.dossier.api.service.ent.mkt.resumes.MktResumeBuilderDto.NewResumeCopyable;
import com.dossier.api.service.ent.mkt.resumes.MktResumeBuilderDto.NewResumeBody;
import com.dossier.api.service.ent.mkt.resumes.MktResumeBuilderDto.NewResumeCreated;
import com.dossier.api.service.ent.mkt.resumes.MktResumeBuilderDto.NewResumeProfileSummary;
import com.dossier.api.service.ent.mkt.resumes.MktResumeBuilderDto.NewResumeSources;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.resume.ResumeActAs;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * "New resume for a consultant" (Enterprise V2, doc 30 sections 3, 5 and 6): a marketer starts a resume for one of their ASSIGNED consultants in the
 * existing Resume Builder, in act-for mode. The resume is saved under the CONSULTANT's account (it is theirs), every author login records the
 * marketer ({@link ResumeActAs}), it is linked into the directory as {@code ORG_MANAGED} and starts {@code PENDING}, and only the consultant
 * approves it (their own My Resumes page). Nothing here submits anything for anyone, creates a share link, or reads a file.
 *
 * <p>Gate, in this order, every refusal the same generic 404 (never 403): the Marketing workspace is on, the caller holds {@code resumes.edit_for},
 * the consultant is inside the caller's ASSIGNED scope and belongs to this organization. The organization always comes from the host (the
 * {@code @OrgPermissionRequired} resolution of the path's org against the tenant), never from the body. A consultant who has no sign-in yet cannot be
 * acted for (409 CONSULTANT_HAS_NO_ACCOUNT): nobody could approve the result. The consultant's resume cap is the organization license's
 * ({@code OrgResumeCap}), counted on the consultant's account.
 */
@Service
public class MktResumeBuilderService {

    public static final String EDIT_KEY = MktResumesService.EDIT_KEY;
    public static final String AUDIT_CREATE = "MARKETER_RESUME_CREATE";

    private final MktScope scope;
    private final AuthorizationService authorization;
    private final ConsultantProfileRepository consultants;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final OrgResumeRepository orgResumes;
    private final MktResumeRepository mktResumes;
    private final ProfileItemRepository profileItems;
    private final BioRepository bios;
    private final ResumeDocService docs;
    private final MktResumesService board;
    private final OrgAuditService audit;
    private final ObjectMapper mapper;

    public MktResumeBuilderService(
        MktScope scope,
        AuthorizationService authorization,
        ConsultantProfileRepository consultants,
        OrgMemberRepository members,
        UserRepository users,
        OrgResumeRepository orgResumes,
        MktResumeRepository mktResumes,
        ProfileItemRepository profileItems,
        BioRepository bios,
        ResumeDocService docs,
        MktResumesService board,
        OrgAuditService audit,
        ObjectMapper mapper
    ) {
        this.scope = scope;
        this.authorization = authorization;
        this.consultants = consultants;
        this.members = members;
        this.users = users;
        this.orgResumes = orgResumes;
        this.mktResumes = mktResumes;
        this.profileItems = profileItems;
        this.bios = bios;
        this.docs = docs;
        this.board = board;
        this.audit = audit;
        this.mapper = mapper;
    }

    // ---- the picker -------------------------------------------------------------------------------------------------------------

    /** The consultants the caller may start a resume for: the ASSIGNED ones for a marketer, everyone for an ORG-scope holder. */
    @Transactional(readOnly = true)
    public List<NewResumeConsultant> candidates(OrgMembership me) {
        MktScope.View view = editView(me);
        List<ConsultantProfile> all = view.all()
            ? mktResumes.allConsultants(me.orgId())
            : view.consultantIds().isEmpty() ? List.of() : mktResumes.consultants(me.orgId(), view.consultantIds());
        return all
            .stream()
            .filter(c -> view.sees(c.getId()) && "ACTIVE".equals(c.getStatus()))
            .sorted(Comparator.comparing((ConsultantProfile c) -> c.getDisplayName() == null ? "" : c.getDisplayName().toLowerCase(Locale.ROOT)))
            .map(c -> new NewResumeConsultant(c.getId(), c.getDisplayName(), c.getJobTitle(), accountOf(me.orgId(), c).isPresent()))
            .toList();
    }

    /** What "Use their profile" and "Copy an existing resume" offer for one consultant. */
    @Transactional(readOnly = true)
    public NewResumeSources sources(OrgMembership me, Long consultantId) {
        MktScope.View view = editView(me);
        ConsultantProfile c = consultant(view, me.orgId(), consultantId);
        User owner = accountOf(me.orgId(), c).orElseThrow(MktResumeBuilderService::noAccount);
        List<ProfileItem> items = profileItems.findByUserIdAndDeletedAtIsNullOrderBySectionAscPositionAsc(owner.getId()).stream().filter(i -> !i.isHidden()).toList();
        int skills = 0;
        for (ProfileItem i : items) if (i.getSection() == ProfileSection.SKILL) skills += skillCount(i.getDataJson());
        NewResumeProfileSummary profile = new NewResumeProfileSummary(
            items.size(),
            (int) items.stream().filter(i -> i.getSection() == ProfileSection.EXPERIENCE).count(),
            (int) items.stream().filter(i -> i.getSection() == ProfileSection.EDUCATION).count(),
            skills,
            headlineOf(owner)
        );
        List<NewResumeCopyable> copyable = orgResumes
            .findByOrgIdAndConsultantId(me.orgId(), c.getId())
            .stream()
            .filter(r -> r.getResumeId() != null)
            .sorted(Comparator.comparing(OrgResume::getUpdatedAt).reversed())
            .map(r -> new NewResumeCopyable(r.getResumeId(), r.getName(), "BUILT", r.getUpdatedAt()))
            .toList();
        return new NewResumeSources(c.getId(), c.getDisplayName(), profile, copyable);
    }

    // ---- create -----------------------------------------------------------------------------------------------------------------

    /** Creates the resume under the consultant, in act-for mode; it lands {@code PENDING} for the consultant to approve. */
    @Transactional
    public NewResumeCreated create(OrgMembership me, Long consultantId, NewResumeBody body) {
        MktScope.View view = editView(me);
        ConsultantProfile c = consultant(view, me.orgId(), consultantId);
        User owner = accountOf(me.orgId(), c).orElseThrow(MktResumeBuilderService::noAccount);
        NewResumeBody b = body == null ? new NewResumeBody(null, null, null, null) : body;
        requireCopySourceInDirectory(me.orgId(), c, b.source());
        BuiltResumeDTO built = ResumeActAs.run(
            owner,
            new ResumeActAs.Scope(me.orgId(), me.login(), me.userId()),
            () -> docs.createBuilt(b.templateId(), b.target(), b.label(), b.source())
        );
        Long resumeId = built.resume().getId();
        OrgResume row = orgResumes
            .findFirstByOrgIdAndResumeIdOrderByIdAsc(me.orgId(), resumeId)
            .orElseThrow(() -> new IllegalStateException("The new resume was not linked into the organization directory"));
        audit.record(
            me.orgId(),
            me.login(),
            me.role(),
            AUDIT_CREATE,
            OrgAuditService.TARGET_RESUME,
            null,
            String.valueOf(row.getId()),
            "consultant=" + c.getId() + " source=" + sourceKind(b.source()),
            null,
            null,
            owner.getLogin(),
            "LOW"
        );
        return new NewResumeCreated(row.getId(), resumeId, c.getId(), board.detail(me, row.getId()));
    }

    /**
     * A {@code copy} source must be one of the consultant's resumes the ORGANIZATION may see: linked into this organization's directory for this very
     * consultant. The builder's own copy only checks ownership, so without this a marketer could clone any resume the consultant owns, linked or not
     * (a private one, one made for another organization). Anything else is the generic 404.
     */
    private void requireCopySourceInDirectory(Long orgId, ConsultantProfile c, JsonNode source) {
        // read the kind exactly as ResumeDocService does (trimmed, any case), so no spelling of "copy" slips past this check
        if (!"copy".equalsIgnoreCase(sourceKind(source).trim())) return;
        JsonNode from = source.get("fromResumeId");
        Long fromResumeId = from != null && from.canConvertToLong() ? from.longValue() : null;
        if (fromResumeId == null) throw new OrgNotFoundException();
        boolean linked = orgResumes
            .findByOrgIdAndConsultantId(orgId, c.getId())
            .stream()
            .anyMatch(r -> fromResumeId.equals(r.getResumeId()) && orgId.equals(r.getOrgId()) && c.getId().equals(r.getConsultantId()));
        if (!linked) throw new OrgNotFoundException();
    }

    // ---- gate -------------------------------------------------------------------------------------------------------------------

    private MktScope.View editView(OrgMembership me) {
        MktScope.View view = scope.resolve(me, EDIT_KEY);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(EDIT_KEY), Beneficiary.NONE, null, AuthzOperation.WRITE).withActor(me));
        return view;
    }

    private ConsultantProfile consultant(MktScope.View view, Long orgId, Long consultantId) {
        if (consultantId == null) throw new OrgNotFoundException();
        scope.require(view, consultantId);
        ConsultantProfile c = consultants.findByOrgIdAndId(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
        if (!"ACTIVE".equals(c.getStatus())) throw new OrgNotFoundException();
        return c;
    }

    /**
     * The consultant's account: their ACTIVE seat's user, but only when it is an ENTERPRISE account of THIS organization (decision O4: personal and
     * enterprise accounts are separate and never connected, so a personal account behind a legacy shared seat is never prepared for). Empty for a
     * consultant with no sign-in, a seat that is not active, or a personal account.
     */
    private Optional<User> accountOf(Long orgId, ConsultantProfile c) {
        if (c.getMemberId() == null) return Optional.empty();
        return members
            .findByOrgIdAndId(orgId, c.getMemberId())
            .filter(m -> m.getStatus() == OrgMemberStatus.ACTIVE && m.getUserId() != null)
            .map(OrgMember::getUserId)
            .flatMap(users::findById)
            .filter(u -> orgId.equals(u.getOrgId()) && u.isActivated());
    }

    private static OrgException noAccount() {
        return OrgException.coded(409, "CONSULTANT_HAS_NO_ACCOUNT", "This consultant has no sign-in yet, so they could not approve a resume made for them.", Map.of());
    }

    private static String sourceKind(JsonNode source) {
        if (source == null || source.isNull()) return "profile";
        if (source.isTextual()) return source.textValue();
        return source.path("kind").asText("profile");
    }

    private int skillCount(String dataJson) {
        try {
            JsonNode n = mapper.readTree(dataJson == null ? "{}" : dataJson).path("skills");
            return n.isArray() ? n.size() : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    private String headlineOf(User owner) {
        return bios
            .findByUserId(owner.getId())
            .stream()
            .findFirst()
            .map(Bio::getPayload)
            .map(p -> {
                try {
                    JsonNode n = mapper.readTree(p);
                    String h = n.path("headline").asText(n.path("currentTitle").asText(""));
                    return h.isBlank() ? null : h.strip();
                } catch (Exception e) {
                    return null;
                }
            })
            .orElse(null);
    }
}
