package com.dossier.api.service.ent.resumes;

import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.service.ResumeDocException;
import com.dossier.api.service.dto.ResumeBuilderConfigDTO;
import com.dossier.api.service.resume.ResumeActAs;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * What the ONE Resume Builder may do depending on where it runs (Enterprise V2, doc 19 section 3.1, doc 24 and doc 30), decided on the server so the
 * web's hidden buttons are never the only wall. The mode comes from the request: acting for a consultant ({@link ResumeActAs}), inside an organization
 * workspace (the host, see {@link OrgResumeCap#orgOfThisRequest}), or the personal product (everything as it always was).
 *
 * <table>
 *   <caption>capabilities by mode</caption>
 *   <tr><th>capability</th><th>personal</th><th>consultant (organization)</th><th>marketer act-for</th></tr>
 *   <tr><td>share links and named people</td><td>yes</td><td>no (404: an enterprise account's resume never shows on kiwiply.com)</td><td>no (404, never)</td></tr>
 *   <tr><td>delete / archive</td><td>yes</td><td>no (409 MANAGED_BY_ORGANIZATION: the organization's list owns the directory row)</td><td>no (404)</td></tr>
 *   <tr><td>set primary</td><td>yes</td><td>no (409; the My Resumes page sets the organization's primary)</td><td>no (404)</td></tr>
 *   <tr><td>rename, duplicate, checkpoints, restore a version</td><td>yes</td><td>yes</td><td>no (404)</td></tr>
 *   <tr><td>AI rewrite, summary, suggestions, tailor</td><td>by plan</td><td>no (402 FEATURE_NOT_LICENSED until the license catalog grants them)</td><td>no (404)</td></tr>
 *   <tr><td>original uploaded file</td><td>yes</td><td>yes</td><td>no (404)</td></tr>
 *   <tr><td>the resume cap</td><td>by plan</td><td>the organization license's</td><td>the consultant's, the license's</td></tr>
 *   <tr><td>submit / apply</td><td colspan="3">never: the builder has no such action in any mode</td></tr>
 * </table>
 */
@Service
public class OrgResumePolicy {

    public enum Mode {
        PERSONAL("personal"),
        CONSULTANT("consultant"),
        MARKETER_ACT_FOR("marketer-act-for");

        private final String wire;

        Mode(String wire) {
            this.wire = wire;
        }

        public String wire() {
            return wire;
        }
    }

    public static final String CODE_MANAGED = "MANAGED_BY_ORGANIZATION";
    public static final String CODE_NOT_LICENSED = "FEATURE_NOT_LICENSED";

    private final OrgResumeRepository orgResumes;

    public OrgResumePolicy(OrgResumeRepository orgResumes) {
        this.orgResumes = orgResumes;
    }

    /** The mode of this request. */
    public static Mode mode() {
        if (ResumeActAs.current().isPresent()) return Mode.MARKETER_ACT_FOR;
        return OrgResumeCap.orgOfThisRequest().isPresent() ? Mode.CONSULTANT : Mode.PERSONAL;
    }

    /** The capabilities the builder config tells the web (the same facts the checks below enforce). */
    public static ResumeBuilderConfigDTO.BuilderCapabilities capabilities() {
        return switch (mode()) {
            case PERSONAL -> new ResumeBuilderConfigDTO.BuilderCapabilities(Mode.PERSONAL.wire(), true, true, true, true, true, true, true, true, true, true, null);
            case CONSULTANT -> new ResumeBuilderConfigDTO.BuilderCapabilities(Mode.CONSULTANT.wire(), false, false, false, false, true, true, true, true, false, false, null);
            case MARKETER_ACT_FOR -> new ResumeBuilderConfigDTO.BuilderCapabilities(
                Mode.MARKETER_ACT_FOR.wire(), false, false, false, false, false, false, false, false, false, false, "Pending consultant approval"
            );
        };
    }

    /** Delete, archive or make primary a resume the organization directory links to: refused inside an organization workspace. */
    public void requireNotOrganizationManaged(Long resumeId) {
        Long orgId = OrgResumeCap.orgOfThisRequest().orElse(null);
        if (orgId == null || resumeId == null) return;
        if (orgResumes.findFirstByOrgIdAndResumeIdOrderByIdAsc(orgId, resumeId).isPresent()) {
            throw new ResumeDocException(409, CODE_MANAGED, "Your organization manages this resume's place in its directory: use My Resumes to change it.", Map.of());
        }
    }

    /** Share links and named people: an enterprise account's resume is never shared outside the organization (404, the same answer as a resume that is not yours). */
    public static void refuseSharingInOrganization() {
        if (mode() != Mode.PERSONAL) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume not found");
    }

    /** Builder AI inside an organization: not part of any license until the catalog grants it (doc 24 feature ai.resume_tailoring), so 402. */
    public static void requireAiLicensed() {
        if (mode() != Mode.PERSONAL) {
            throw new ResumeDocException(402, CODE_NOT_LICENSED, "AI tools are not included in your organization's license.", Map.of("featureKey", "ai.resume_tailoring", "canSelfServe", false));
        }
    }
}
