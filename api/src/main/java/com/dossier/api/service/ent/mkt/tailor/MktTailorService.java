package com.dossier.api.service.ent.mkt.tailor;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRow;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ProRequiredException;
import com.dossier.api.service.ResumeDocService;
import com.dossier.api.service.ResumeTailorService;
import com.dossier.api.service.dto.BuiltResumeDTO;
import com.dossier.api.service.dto.ResumeDocDTO;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.licenses.OrgLicenseGate;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesService;
import com.dossier.api.service.ent.mkt.opportunities.PinnedResumes;
import com.dossier.api.service.ent.mkt.resumes.MktResumesService;
import com.dossier.api.service.entitlement.FeatureKeys;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.resume.ResumeActAs;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Marketer tailoring (docs/enterprise-v2/MKT-TAILOR-BUILD.md, gap D2): a marketer has AI tailor one of a consultant's resumes for an assigned job, keeps
 * or skips each change, ticks only the missing keywords that are true, and saves the result as a NEW resume in the consultant's account. It lands
 * waiting for the consultant's approval (act-for) and is chosen for the job (D3), so Prepare uses it once they approve it.
 *
 * <p>Gates, in order (every refusal before the licence is the generic 404): {@code resumes.edit_for} and {@code opportunities.manage} with the
 * consultant in the caller's scope; an assigned job; a consultant with an organization account (409 {@code CONSULTANT_HAS_NO_ACCOUNT}); the
 * consultant's licence carries {@code ai.resume_tailoring} (402 {@code FEATURE_NOT_LICENSED}). The AI is charged to the CONSULTANT's budget
 * (user decision 2026-11-11). The score is keyword coverage, with no AI ({@link KeywordCoverage}).
 */
@Service
public class MktTailorService {

    public static final String AUDIT_TAILOR = "MARKETER_RESUME_TAILOR";

    public record Source(Long orgResumeId, String name) {}

    public record Keyword(String term, boolean coveredBefore) {}

    /** One change the marketer may keep: {@code adds} are the job's terms it newly covers (the live score adds them when kept). */
    public record Change(String ref, String section, String before, String after, List<String> adds) {}

    /**
     * The proposal. {@code status}: OK, NOTHING_TO_CHANGE (the resume already fits; nothing to keep), QUOTA_EXCEEDED (the consultant's AI budget is spent
     * this month), NO_JOB_DESCRIPTION (the job has too little text), DISABLED (AI is off), ERROR (the AI answered badly; try again).
     * {@code scoreBefore} is null when the job names no terms.
     */
    public record Proposal(Long proposalId, String status, Source source, String jobTitle, Integer scoreBefore, List<Keyword> keywords, List<Change> changes, List<String> additions) {}

    public record ProposeRequest(Long orgResumeId) {}

    public record ApplyRequest(List<String> keep, List<String> additions, String label) {}

    public record Applied(Long orgResumeId, Long resumeId, String name, Integer scoreBefore, Integer scoreAfter, List<String> applied, List<String> skipped, List<String> added, List<String> notAdded, MktOpportunitiesDTO.Detail detail) {}

    private final MktScope scope;
    private final AuthorizationService authorization;
    private final MktOpportunityRepository opportunities;
    private final ConsultantProfileRepository consultants;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final OrgResumeRepository orgResumes;
    private final ResumeRepository resumes;
    private final ClientRequirementRepository requirements;
    private final RequirementSkillRepository requirementSkills;
    private final ResumeTailorService tailor;
    private final ResumeDocService docs;
    private final OrgLicenseGate licenses;
    private final MktOpportunitiesService opportunityService;
    private final OrgAuditService audit;
    private final ObjectMapper om = new ObjectMapper();

    public MktTailorService(
        MktScope scope,
        AuthorizationService authorization,
        MktOpportunityRepository opportunities,
        ConsultantProfileRepository consultants,
        OrgMemberRepository members,
        UserRepository users,
        OrgResumeRepository orgResumes,
        ResumeRepository resumes,
        ClientRequirementRepository requirements,
        RequirementSkillRepository requirementSkills,
        ResumeTailorService tailor,
        ResumeDocService docs,
        OrgLicenseGate licenses,
        MktOpportunitiesService opportunityService,
        OrgAuditService audit
    ) {
        this.scope = scope;
        this.authorization = authorization;
        this.opportunities = opportunities;
        this.consultants = consultants;
        this.members = members;
        this.users = users;
        this.orgResumes = orgResumes;
        this.resumes = resumes;
        this.requirements = requirements;
        this.requirementSkills = requirementSkills;
        this.tailor = tailor;
        this.docs = docs;
        this.licenses = licenses;
        this.opportunityService = opportunityService;
        this.audit = audit;
    }

    /** Everything both calls check and load: the job row, the consultant, their account and the job's text. */
    private record Ctx(Long orgId, MktOpportunityRow row, ConsultantProfile consultant, User owner, ClientRequirement job, List<String> jobSkills) {}

    private Ctx context(OrgMembership me, Long matchId) {
        MktScope.View view = scope.resolve(me, MktResumesService.EDIT_KEY);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(MktResumesService.EDIT_KEY), Beneficiary.NONE, null, AuthzOperation.WRITE).withActor(me));
        scope.resolve(me, MktOpportunitiesService.PERMISSION); // the job board's own key: a marketer who can't manage opportunities gets the generic 404 here
        Long orgId = me.orgId();
        MktOpportunityRow row = opportunities.findRow(orgId, matchId).orElseThrow(OrgNotFoundException::new);
        scope.require(view, row.consultantId());
        if (row.oppId() == null || !"ASSIGNED".equals(row.matchStatus())) throw OrgException.coded(409, "NOT_ASSIGNED", "Tailor a resume once the job is assigned.", Map.of());
        ConsultantProfile c = consultants.findByOrgIdAndId(orgId, row.consultantId()).filter(x -> "ACTIVE".equals(x.getStatus())).orElseThrow(OrgNotFoundException::new);
        User owner = accountOf(orgId, c).orElseThrow(() -> OrgException.coded(409, "CONSULTANT_HAS_NO_ACCOUNT", "This consultant needs an organization account, so they can approve a resume made for them.", Map.of()));
        if (!licenses.has(orgId, c.getId(), FeatureKeys.AI_RESUME_TAILORING)) {
            throw OrgException.coded(402, "FEATURE_NOT_LICENSED", c.getDisplayName() + "'s licence doesn't include AI resume tailoring. An admin can add it on the Licenses page.", Map.of("featureKey", FeatureKeys.AI_RESUME_TAILORING, "canSelfServe", false));
        }
        ClientRequirement job = requirements.findByOrgIdAndId(orgId, row.requirementId()).orElseThrow(OrgNotFoundException::new);
        List<String> skills = requirementSkills.findByOrgIdAndRequirementIdIn(orgId, List.of(job.getId())).stream()
            .sorted(Comparator.comparingInt((RequirementSkill s) -> s.getSortOrder() == null ? 0 : s.getSortOrder()))
            .map(RequirementSkill::getSkill)
            .filter(Objects::nonNull)
            .toList();
        return new Ctx(orgId, row, c, owner, job, skills);
    }

    // ---- propose ------------------------------------------------------------------------------------------------------------

    /** Ask the AI for a tailored version of {@code orgResumeId} (default: the job's chosen resume, else the primary) for this job. */
    @Transactional
    public Proposal propose(OrgMembership me, Long matchId, Long orgResumeId) {
        Ctx ctx = context(me, matchId);
        OrgResume src = source(ctx, orgResumeId);
        Resume resume = ownedResume(ctx, src);
        ResumeTailorService.Result r;
        try {
            r = tailor.proposeFor(ctx.owner(), resume, ctx.job().getDescriptionText(), ctx.job().getTitle(), ctx.row().clientName());
        } catch (ProRequiredException e) {
            throw OrgException.coded(402, "FEATURE_NOT_LICENSED", ctx.consultant().getDisplayName() + "'s licence has no AI budget for tailoring.", Map.of("featureKey", FeatureKeys.AI_RESUME_TAILORING));
        }
        Source source = new Source(src.getId(), src.getName());
        if (r.proposal() == null) return new Proposal(null, r.status().name(), source, ctx.job().getTitle(), null, List.of(), List.of(), List.of());

        JsonNode structured = parsed(resume);
        String text = KeywordCoverage.text(structured);
        List<String> terms = KeywordCoverage.terms(ctx.jobSkills(), r.proposal().suggestions());
        Set<String> coveredBefore = KeywordCoverage.covered(text, terms);
        List<Keyword> keywords = terms.stream().map(t -> new Keyword(t, coveredBefore.contains(t))).toList();
        List<Change> changes = new ArrayList<>();
        for (ResumeTailorService.Change c : r.proposal().changes()) {
            if ("skills".equals(c.ref())) continue; // a skills reorder has no place in a builder document's grouped skills
            changes.add(new Change(c.ref(), c.section(), c.before(), c.after(), KeywordCoverage.adds(text, c.before(), c.after(), terms)));
        }
        List<String> additions = new ArrayList<>();
        for (String s : r.proposal().suggestions()) if (s != null && !s.isBlank() && !KeywordCoverage.covers(text, s)) additions.add(s.trim());
        String status = changes.isEmpty() && additions.isEmpty() ? "NOTHING_TO_CHANGE" : r.status() == ResumeTailorService.Status.NOTHING_TO_CHANGE ? "OK" : r.status().name();
        return new Proposal(r.proposal().proposalId(), status, source, ctx.job().getTitle(), KeywordCoverage.percent(coveredBefore, terms), keywords, changes, additions);
    }

    // ---- apply --------------------------------------------------------------------------------------------------------------

    /**
     * Save the kept changes and the ticked additions as a NEW resume in the consultant's account (act-for: it waits for their approval) and choose it for
     * the job. 404 for a proposal that isn't this consultant's; 409 {@code RESUME_CHANGED} when the source resume changed since; 400 when nothing is
     * kept or ticked. An addition must be one of the proposal's missing keywords.
     */
    @Transactional
    public Applied apply(OrgMembership me, Long matchId, Long proposalId, ApplyRequest body) {
        Ctx ctx = context(me, matchId);
        ResumeTailorService.StoredProposal stored = tailor.stored(proposalId, ctx.owner().getId()).orElseThrow(OrgNotFoundException::new);
        Resume source = resumes.findById(stored.resumeId()).filter(x -> x.getUser() != null && ctx.owner().getId().equals(x.getUser().getId())).orElseThrow(OrgNotFoundException::new);
        OrgResume srcRow = orgResumes.findByOrgIdAndConsultantId(ctx.orgId(), ctx.consultant().getId()).stream().filter(x -> source.getId().equals(x.getResumeId())).findFirst().orElseThrow(OrgNotFoundException::new);
        if (!stored.resumeHash().equals(ResumeTailorService.hashOf(source))) {
            throw OrgException.coded(409, "RESUME_CHANGED", "That resume changed since it was tailored. Tailor it again.", Map.of());
        }
        Set<String> keep = new LinkedHashSet<>(body == null || body.keep() == null ? List.of() : body.keep());
        keep.remove("skills");
        Set<String> suggested = new LinkedHashSet<>();
        stored.result().path("suggestions").forEach(s -> suggested.add(s.asText("").trim().toLowerCase(Locale.ROOT)));
        List<String> additions = new ArrayList<>();
        for (String a : body == null || body.additions() == null ? List.<String>of() : body.additions()) {
            String t = a == null ? "" : a.trim();
            if (t.isEmpty()) continue;
            if (!suggested.contains(t.toLowerCase(Locale.ROOT))) throw OrgException.coded(400, "VALIDATION", "additions: only the missing keywords the AI listed can be added", Map.of("field", "additions"));
            additions.add(t);
        }
        if (keep.isEmpty() && additions.isEmpty()) throw OrgException.coded(400, "VALIDATION", "Keep at least one change or add one keyword", Map.of());

        JsonNode structured = parsed(source);
        List<TailoredDoc.Edit> edits = TailoredDoc.edits(stored.result(), keep, originals(structured));
        String name = label(body, srcRow, ctx.job());
        ResumeActAs.Scope actAs = new ResumeActAs.Scope(ctx.orgId(), me.login(), me.userId());
        ObjectNode sourceSpec = om.createObjectNode().put("kind", "copy").put("fromResumeId", source.getId());
        BuiltResumeDTO built = ResumeActAs.run(ctx.owner(), actAs, () -> docs.createBuilt(null, ctx.job().getTitle(), name, sourceSpec));
        Long newResumeId = built.resume().getId();
        TailoredDoc.Outcome outcome = ResumeActAs.run(ctx.owner(), actAs, () -> {
            ResumeDocDTO current = docs.get(newResumeId);
            ObjectNode doc = (ObjectNode) current.getDoc().deepCopy();
            TailoredDoc.Outcome o = TailoredDoc.apply(doc, edits, additions);
            if (!o.applied().isEmpty() || !o.added().isEmpty()) {
                docs.put(newResumeId, "\"" + current.getDocVersion() + "\"", om.createObjectNode().set("doc", doc));
            }
            return o;
        });
        OrgResume row = orgResumes.findFirstByOrgIdAndResumeIdOrderByIdAsc(ctx.orgId(), newResumeId)
            .orElseThrow(() -> new IllegalStateException("The tailored resume was not linked into the organization directory"));

        // the score the marketer saw: the resume's own coverage, plus what the applied changes and the added keywords bring
        String text = KeywordCoverage.text(structured);
        List<String> suggestions = new ArrayList<>();
        stored.result().path("suggestions").forEach(s -> suggestions.add(s.asText("")));
        List<String> terms = KeywordCoverage.terms(ctx.jobSkills(), suggestions);
        Set<String> before = KeywordCoverage.covered(text, terms);
        Set<String> after = new LinkedHashSet<>(before);
        for (TailoredDoc.Edit e : edits) if (outcome.applied().contains(e.ref())) after.addAll(KeywordCoverage.adds(text, e.before(), e.after(), terms));
        for (String a : outcome.added()) for (String t : terms) if (t.equalsIgnoreCase(a)) after.add(t);

        audit.record(me, AUDIT_TAILOR, OrgAuditService.TARGET_RESUME, ctx.owner().getLogin(), String.valueOf(row.getId()),
            "consultant=" + ctx.consultant().getId() + " job=" + ctx.job().getId() + " from=" + srcRow.getId() + " changes=" + outcome.applied().size() + " added=" + outcome.added().size());
        MktOpportunitiesDTO.Detail detail = opportunityService.pinResume(me, matchId, row.getId());
        return new Applied(row.getId(), newResumeId, row.getName(), KeywordCoverage.percent(before, terms), KeywordCoverage.percent(after, terms), outcome.applied(), outcome.skipped(), outcome.added(), outcome.notAdded(), detail);
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------------

    /** The source: the one asked for, else the job's chosen resume, else the consultant's primary, else their newest; it must be choosable and have a file. */
    private OrgResume source(Ctx ctx, Long orgResumeId) {
        List<OrgResume> mine = orgResumes.findByOrgIdAndConsultantId(ctx.orgId(), ctx.consultant().getId()).stream().filter(PinnedResumes::choosable).toList();
        Optional<OrgResume> pick;
        if (orgResumeId != null) {
            pick = mine.stream().filter(r -> orgResumeId.equals(r.getId())).findFirst();
            if (pick.isEmpty()) throw new OrgNotFoundException();
        } else {
            Long pinned = opportunities.findByOrgIdAndMatchId(ctx.orgId(), ctx.row().matchId()).map(o -> o.getPinnedOrgResumeId()).orElse(null);
            pick = mine.stream().filter(r -> r.getId().equals(pinned)).findFirst()
                .or(() -> mine.stream().filter(OrgResume::isPrimaryForOrg).findFirst())
                .or(() -> mine.stream().max(Comparator.comparing(OrgResume::getUpdatedAt, Comparator.nullsFirst(Comparator.naturalOrder()))));
        }
        return pick.orElseThrow(() -> OrgException.coded(409, "NO_RESUME", ctx.consultant().getDisplayName() + " has no resume to tailor yet.", Map.of()));
    }

    private Resume ownedResume(Ctx ctx, OrgResume src) {
        return resumes.findById(src.getResumeId())
            .filter(x -> x.getUser() != null && ctx.owner().getId().equals(x.getUser().getId()) && !Boolean.TRUE.equals(x.getArchived()))
            .orElseThrow(() -> OrgException.coded(409, "NO_RESUME", "That resume can't be tailored: it isn't in " + ctx.consultant().getDisplayName() + "'s account.", Map.of()));
    }

    /** The consultant's organization account (decision O4): their ACTIVE seat's user, an account of this organization. */
    private Optional<User> accountOf(Long orgId, ConsultantProfile c) {
        if (c.getMemberId() == null) return Optional.empty();
        return members.findByOrgIdAndId(orgId, c.getMemberId())
            .filter(m -> m.getStatus() == OrgMemberStatus.ACTIVE && m.getUserId() != null)
            .map(OrgMember::getUserId)
            .flatMap(users::findById)
            .filter(u -> orgId.equals(u.getOrgId()) && u.isActivated());
    }

    private JsonNode parsed(Resume r) {
        try {
            JsonNode n = r.getParsedJson() == null ? null : om.readTree(r.getParsedJson());
            return n != null && n.isObject() ? n : om.createObjectNode();
        } catch (Exception e) {
            return om.createObjectNode();
        }
    }

    /** The original text of every ref a proposal can name: the summary and each role's bullets (the structured view's order). */
    static Map<String, String> originals(JsonNode structured) {
        Map<String, String> out = new LinkedHashMap<>();
        out.put("summary", structured.path("summary").asText(""));
        int i = 0;
        for (JsonNode e : structured.path("experience")) {
            int j = 0;
            for (JsonNode b : e.path("bullets")) out.put("e" + i + "b" + j++, b.asText(""));
            i++;
        }
        return out;
    }

    private static String label(ApplyRequest body, OrgResume src, ClientRequirement job) {
        String given = body == null || body.label() == null ? "" : body.label().trim();
        String name = !given.isEmpty() ? given : (src.getName() == null || src.getName().isBlank() ? "Resume" : src.getName()) + " - " + (job.getTitle() == null ? "tailored" : job.getTitle());
        return name.length() > 200 ? name.substring(0, 200) : name;
    }
}
