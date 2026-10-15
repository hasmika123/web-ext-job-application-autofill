package com.dossier.api.service.ent.mkt.resumes;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.resume.ResumeActAs;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one gate in front of the Resume Builder's ordinary routes when a marketer edits a consultant's resume in act-for mode (Enterprise V2, doc 30
 * section 6). The builder is the only editor, so the marketer's editor calls the SAME routes the consultant's does ({@code /api/profile/resumes/{id}/doc}
 * and friends); the request names the directory row it is for in the {@code X-Kiwiply-Act-For} header and this class decides, answering the generic 404 for
 * every refusal:
 * <ol>
 *   <li>the request is on an organization host (the organization comes from the host, never from the header) and the caller is an ACTIVE member of it;</li>
 *   <li>the caller holds {@code resumes.edit_for} and the consultant of that row is inside their ASSIGNED scope (the same gate as the Marketing page);</li>
 *   <li>the row is linked to a builder resume, the consultant has an account, and the caller is not that consultant;</li>
 *   <li>the route is on the short allow-list ({@link #allows}) and names that very resume. Everything else (sharing, delete, primary, archive, AI, the original
 *       file, checkpoints and restores, rename) is NOT acting-for material and is a 404 here: the capabilities the builder shows are enforced, not just hidden.</li>
 * </ol>
 * Nothing here submits anything for the consultant, and what a marketer wrote waits for the consultant's approval ({@code OrgResumeLinkService}).
 */
@Service
public class ActForBuilderGate {

    /** The request header that carries the directory row (org_resume id) the editor is acting on. */
    public static final String HEADER = "X-Kiwiply-Act-For";

    /** What an authorised act-for request runs as. */
    public record Grant(User owner, ResumeActAs.Scope scope, Long resumeId, OrgResume link) {}

    private static final String ID = "/api/profile/resumes/(\\d+)";
    private static final List<Rule> RULES = List.of(
        new Rule("GET", ID + "/doc"),
        new Rule("PUT", ID + "/doc"),
        new Rule("PATCH", ID + "/doc/template"),
        new Rule("PATCH", ID + "/doc/theme"),
        new Rule("GET", ID + "/meta"),
        new Rule("GET", ID + "/lineage"),
        new Rule("GET", ID + "/doc/versions"),
        new Rule("GET", ID + "/doc/versions/\\d+/text"),
        new Rule("GET", ID + "/doc/pdf-status"),
        new Rule("POST", ID + "/doc/pdf-now"),
        new Rule("GET", "/api/profile/resume-builder/config")
    );

    private record Rule(String method, String path) {
        Pattern pattern() {
            return Pattern.compile(path);
        }
    }

    private final OrgAccessService access;
    private final MktScope scope;
    private final AuthorizationService authorization;
    private final OrgResumeRepository orgResumes;
    private final ConsultantProfileRepository consultants;
    private final OrgMemberRepository members;
    private final UserRepository users;

    public ActForBuilderGate(
        OrgAccessService access,
        MktScope scope,
        AuthorizationService authorization,
        OrgResumeRepository orgResumes,
        ConsultantProfileRepository consultants,
        OrgMemberRepository members,
        UserRepository users
    ) {
        this.access = access;
        this.scope = scope;
        this.authorization = authorization;
        this.orgResumes = orgResumes;
        this.consultants = consultants;
        this.members = members;
        this.users = users;
    }

    /**
     * The allow-list: is {@code method path} something an acting marketer may call, and (for a per-resume route) does it name {@code resumeId}?
     * The config route names no resume (it is how the editor learns what it may show).
     */
    public static boolean allows(String method, String path, Long resumeId) {
        for (Rule r : RULES) {
            if (!r.method().equalsIgnoreCase(method)) continue;
            java.util.regex.Matcher m = r.pattern().matcher(path);
            if (!m.matches()) continue;
            return m.groupCount() == 0 || (resumeId != null && String.valueOf(resumeId).equals(m.group(1)));
        }
        return false;
    }

    /** Authorises one act-for request or throws the generic 404. {@code orgId} is the tenant host's organization. */
    @Transactional(readOnly = true)
    public Grant authorize(Long orgId, String rawLinkId, String method, String path) {
        Long linkId = parse(rawLinkId);
        OrgMembership me = access.resolve(orgId).orElseThrow(OrgNotFoundException::new);
        MktScope.View view = scope.resolve(me, MktResumesService.EDIT_KEY);
        authorization.require(AuthzRequest.of(orgId, List.of(MktResumesService.EDIT_KEY), Beneficiary.NONE, null, AuthzOperation.WRITE).withActor(me));
        OrgResume link = orgResumes.findByOrgIdAndId(orgId, linkId).orElseThrow(OrgNotFoundException::new);
        if (link.getResumeId() == null) throw new OrgNotFoundException();
        scope.require(view, link.getConsultantId());
        ConsultantProfile c = consultants.findByOrgIdAndId(orgId, link.getConsultantId()).orElseThrow(OrgNotFoundException::new);
        if (c.getMemberId() == null) throw new OrgNotFoundException();
        User owner = members
            .findByOrgIdAndId(orgId, c.getMemberId())
            .filter(m -> m.getStatus() == OrgMemberStatus.ACTIVE && m.getUserId() != null)
            .flatMap(m -> users.findById(m.getUserId()))
            .orElseThrow(OrgNotFoundException::new);
        if (owner.getId().equals(me.userId())) throw new OrgNotFoundException(); // acting for yourself is just editing your own resume
        if (!allows(method, path, link.getResumeId())) throw new OrgNotFoundException();
        return new Grant(owner, new ResumeActAs.Scope(orgId, me.login(), me.userId()), link.getResumeId(), link);
    }

    private static Long parse(String raw) {
        try {
            long v = Long.parseLong(raw == null ? "" : raw.trim());
            if (v <= 0) throw new OrgNotFoundException();
            return v;
        } catch (NumberFormatException e) {
            throw new OrgNotFoundException();
        }
    }
}
