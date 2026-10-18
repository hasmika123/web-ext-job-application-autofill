package com.dossier.api.service.ent.resumes;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.dto.ent.OrgResumePolicyDTO;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The org admin's view of the Resume Builder policy of THEIR organization (the organization comes from the authorised membership, never from the
 * body): today the one switch that lets consultants create share links. It writes the organization's {@code org_setting} row for
 * {@link EnterpriseSettingKeys#ORG_RESUMES_CONSULTANT_SHARE_LINKS}; {@link OrgResumePolicy} reads it. Switching it off also PAUSES every existing
 * consultant share link of the organization's resumes (see {@link ConsultantShareLinkPause}: evaluated live, nothing is rewritten, switching it on restores
 * them). A change writes one {@code ORG_SETTINGS} audit row: old and new value plus how many links were paused or restored.
 */
@Service
public class OrgResumePolicyService {

    private final OrgResumePolicy policy;
    private final OrgSettingRepository orgSettings;
    private final OrgAuditService audit;
    private final ConsultantShareLinkPause pause;

    public OrgResumePolicyService(OrgResumePolicy policy, OrgSettingRepository orgSettings, OrgAuditService audit, ConsultantShareLinkPause pause) {
        this.policy = policy;
        this.orgSettings = orgSettings;
        this.audit = audit;
        this.pause = pause;
    }

    @Transactional(readOnly = true)
    public OrgResumePolicyDTO get(OrgMembership me) {
        return view(me.orgId());
    }

    @Transactional
    public OrgResumePolicyDTO setConsultantShareLinks(OrgMembership me, Boolean value) {
        if (value == null) throw OrgException.invalid("consultantShareLinks", "must be true or false");
        String key = EnterpriseSettingKeys.ORG_RESUMES_CONSULTANT_SHARE_LINKS;
        boolean before = policy.consultantShareLinks(me.orgId());
        OrgSetting row = orgSettings.findByOrgIdAndSettingKey(me.orgId(), key).orElseGet(() -> {
            OrgSetting s = new OrgSetting();
            s.setOrgId(me.orgId());
            s.setSettingKey(key);
            return s;
        });
        row.setValueJson(String.valueOf(value));
        row.setUpdatedBy(me.login());
        orgSettings.saveAndFlush(row);
        if (before != value) {
            // Pausing is decided live from this very row, so the count is what just stopped (off) or came back (on); nothing else is written.
            long links = pause.liveShares(me.orgId());
            audit.record(
                me,
                OrgAuditService.ORG_SETTINGS,
                OrgAuditService.TARGET_ORG,
                null,
                me.orgId().toString(),
                "setting=" + key + " old=" + before + " new=" + value + (value ? " linksRestored=" : " linksPaused=") + links
            );
        }
        return view(me.orgId());
    }

    private OrgResumePolicyDTO view(Long orgId) {
        boolean overridden = orgSettings.findByOrgIdAndSettingKey(orgId, EnterpriseSettingKeys.ORG_RESUMES_CONSULTANT_SHARE_LINKS).isPresent();
        return new OrgResumePolicyDTO(policy.consultantShareLinks(orgId), overridden, pause.liveShares(orgId));
    }
}
