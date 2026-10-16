package com.dossier.api.service.ent.resumes;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ResumeDocException;
import com.dossier.api.service.dto.ResumeBuilderConfigDTO;
import com.dossier.api.service.resume.ResumeActAs;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
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
 *   <tr><td>share links and named people</td><td>yes</td><td>only when the organization turns on {@link EnterpriseSettingKeys#ORG_RESUMES_CONSULTANT_SHARE_LINKS} (default off; 404 otherwise)</td><td>no (404, never, whatever the setting)</td></tr>
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
    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public OrgResumePolicy(OrgResumeRepository orgResumes, OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgResumes = orgResumes;
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    /**
     * Whether consultants of {@code orgId} may create share links for their organization resumes: the organization's own {@code org_setting} row,
     * else the global admin value, else the registry default (off). A malformed override is ignored (the safer global value applies).
     */
    public boolean consultantShareLinks(Long orgId) {
        String key = EnterpriseSettingKeys.ORG_RESUMES_CONSULTANT_SHARE_LINKS;
        Optional<Boolean> override = orgId == null
            ? Optional.empty()
            : orgSettings.findByOrgIdAndSettingKey(orgId, key).map(OrgSetting::getValueJson).flatMap(OrgResumePolicy::parseBool);
        return override.orElseGet(() -> settings.getBool(key));
    }

    /** The setting for the organization THIS request works in (taken from the host, never from the client); false outside an organization. */
    public boolean consultantShareLinksForThisRequest() {
        return OrgResumeCap.orgOfThisRequest().map(this::consultantShareLinks).orElse(false);
    }

    private static Optional<Boolean> parseBool(String json) {
        if (json == null) return Optional.empty();
        return switch (json.strip().toLowerCase(Locale.ROOT)) {
            case "true" -> Optional.of(true);
            case "false" -> Optional.of(false);
            default -> Optional.empty();
        };
    }

    /** The mode of this request. */
    public static Mode mode() {
        if (ResumeActAs.current().isPresent()) return Mode.MARKETER_ACT_FOR;
        return OrgResumeCap.orgOfThisRequest().isPresent() ? Mode.CONSULTANT : Mode.PERSONAL;
    }

    /** The capabilities with the organization's share-link setting off (what a caller without the setting sees). */
    public static ResumeBuilderConfigDTO.BuilderCapabilities capabilities() {
        return capabilities(false);
    }

    /**
     * The capabilities the builder config tells the web (the same facts the checks below enforce). {@code consultantShareLinks} is the organization's
     * setting for this request ({@link #consultantShareLinksForThisRequest()}); it only ever turns share links ON for a consultant, never for act-for.
     */
    public static ResumeBuilderConfigDTO.BuilderCapabilities capabilities(boolean consultantShareLinks) {
        return switch (mode()) {
            case PERSONAL -> new ResumeBuilderConfigDTO.BuilderCapabilities(Mode.PERSONAL.wire(), true, true, true, true, true, true, true, true, true, true, null);
            case CONSULTANT -> new ResumeBuilderConfigDTO.BuilderCapabilities(Mode.CONSULTANT.wire(), consultantShareLinks, false, false, false, true, true, true, true, false, false, null);
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

    /** Share links and named people: refused (404, the same answer as a resume that is not yours) in an organization unless it let consultants share; act-for is never allowed. */
    public static void refuseSharingInOrganization(boolean consultantShareLinks) {
        Mode mode = mode();
        if (mode == Mode.PERSONAL || (mode == Mode.CONSULTANT && consultantShareLinks)) return;
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume not found");
    }

    /** {@link #refuseSharingInOrganization(boolean)} with the setting of the organization this request works in. */
    public void requireShareable() {
        refuseSharingInOrganization(mode() == Mode.CONSULTANT && consultantShareLinksForThisRequest());
    }

    /** Builder AI inside an organization: not part of any license until the catalog grants it (doc 24 feature ai.resume_tailoring), so 402. */
    public static void requireAiLicensed() {
        if (mode() != Mode.PERSONAL) {
            throw new ResumeDocException(402, CODE_NOT_LICENSED, "AI tools are not included in your organization's license.", Map.of("featureKey", "ai.resume_tailoring", "canSelfServe", false));
        }
    }
}
