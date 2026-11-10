package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.service.ent.licenses.OrgLicenseGate;
import com.dossier.api.service.entitlement.FeatureKeys;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The single seam that decides whether a consultant may use Prepare selected openings (docs/enterprise-v2/63; Org Admin control decided 2026-10-18).
 * All three must hold, checked in this order so the refusal names the first thing that is missing:
 * <ol>
 *   <li>the platform master switch is ON ({@code PLATFORM_OFF}: the feature does not exist; the page shows nothing);</li>
 *   <li>the ORGANIZATION has turned it on on its Organization Settings page ({@code ORG_OFF});</li>
 *   <li>the consultant's own LIVE license carries the add-on {@value FeatureKeys#AUTOMATION_APPROVED_APPLY} ("Autopilot prepare", a per-consultant feature of
 *       the E3 pricing), the same pattern as {@code InboxEntitlement} for {@code inbox.monitoring} ({@code NO_LICENSE}).</li>
 * </ol>
 * It reads licenses and never touches billing or subscription code. The answer carries a stable reason code only; nothing about prices or other features.
 */
@Service
public class PrepareBatchEntitlement {

    /** The catalog key of the add-on. */
    public static final String FEATURE = FeatureKeys.AUTOMATION_APPROVED_APPLY;

    public static final String PLATFORM_OFF = "PLATFORM_OFF";
    public static final String ORG_OFF = "ORG_OFF";
    public static final String NO_LICENSE = "NO_LICENSE";

    /** The answer. {@code reason} is a stable code for a refusal and null when allowed. */
    public record Decision(boolean allowed, String reason) {
        public static final Decision ALLOWED = new Decision(true, null);
    }

    /** How many of the organization's active consultants hold the add-on on a live license. */
    public record Coverage(int licensed, int consultants) {}

    private final PrepareBatchSettings settings;
    private final ConsultantProfileRepository consultants;
    private final OrgLicenseGate licenses;

    public PrepareBatchEntitlement(PrepareBatchSettings settings, ConsultantProfileRepository consultants, OrgLicenseGate licenses) {
        this.settings = settings;
        this.consultants = consultants;
        this.licenses = licenses;
    }

    @Transactional(readOnly = true)
    public Decision check(Long orgId, Long memberId) {
        if (orgId == null || memberId == null) return new Decision(false, PLATFORM_OFF);
        if (!settings.platformEnabled()) return new Decision(false, PLATFORM_OFF);
        if (!settings.orgEnabled(orgId)) return new Decision(false, ORG_OFF);
        ConsultantProfile profile = consultants.findByOrgIdAndMemberId(orgId, memberId).orElse(null);
        if (profile == null || !"ACTIVE".equals(profile.getStatus()) || profile.getId() == null) return new Decision(false, NO_LICENSE);
        return licenses.has(orgId, profile.getId(), FEATURE) ? Decision.ALLOWED : new Decision(false, NO_LICENSE);
    }

    /** For the Org Admin's settings page: how many active consultants' licenses include the add-on. */
    @Transactional(readOnly = true)
    public Coverage coverage(Long orgId) {
        if (orgId == null) return new Coverage(0, 0);
        Set<Long> licensed = licenses.consultantsWith(orgId, FEATURE);
        List<ConsultantProfile> active = consultants.findByOrgIdAndStatusOrderByDisplayNameAsc(orgId, "ACTIVE");
        int n = 0;
        for (ConsultantProfile c : active) if (licensed.contains(c.getId())) n++;
        return new Coverage(n, active.size());
    }
}
