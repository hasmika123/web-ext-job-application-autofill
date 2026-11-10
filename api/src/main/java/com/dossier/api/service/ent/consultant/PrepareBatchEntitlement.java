package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.service.entitlement.FeatureKeys;
import java.time.Instant;
import java.util.HashSet;
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

    /** License states that still grant their features: a license that is ending keeps them until it ends. */
    private static final Set<String> GRANTING = Set.of("ACTIVE", "CANCEL_AT_PERIOD_END");

    /** The answer. {@code reason} is a stable code for a refusal and null when allowed. */
    public record Decision(boolean allowed, String reason) {
        public static final Decision ALLOWED = new Decision(true, null);
    }

    /** How many of the organization's active consultants hold the add-on on a live license. */
    public record Coverage(int licensed, int consultants) {}

    private final PrepareBatchSettings settings;
    private final ConsultantProfileRepository consultants;
    private final ConsultantLicenseRepository licenses;
    private final LicenseFeatureRepository features;

    public PrepareBatchEntitlement(PrepareBatchSettings settings, ConsultantProfileRepository consultants, ConsultantLicenseRepository licenses, LicenseFeatureRepository features) {
        this.settings = settings;
        this.consultants = consultants;
        this.licenses = licenses;
        this.features = features;
    }

    @Transactional(readOnly = true)
    public Decision check(Long orgId, Long memberId) {
        if (orgId == null || memberId == null) return new Decision(false, PLATFORM_OFF);
        if (!settings.platformEnabled()) return new Decision(false, PLATFORM_OFF);
        if (!settings.orgEnabled(orgId)) return new Decision(false, ORG_OFF);
        ConsultantProfile profile = consultants.findByOrgIdAndMemberId(orgId, memberId).orElse(null);
        if (profile == null || !"ACTIVE".equals(profile.getStatus()) || profile.getId() == null) return new Decision(false, NO_LICENSE);
        return licensed(orgId).contains(profile.getId()) ? Decision.ALLOWED : new Decision(false, NO_LICENSE);
    }

    /** For the Org Admin's settings page: how many active consultants' licenses include the add-on. */
    @Transactional(readOnly = true)
    public Coverage coverage(Long orgId) {
        if (orgId == null) return new Coverage(0, 0);
        Set<Long> licensed = licensed(orgId);
        List<ConsultantProfile> active = consultants.findByOrgIdAndStatusOrderByDisplayNameAsc(orgId, "ACTIVE");
        int n = 0;
        for (ConsultantProfile c : active) if (licensed.contains(c.getId())) n++;
        return new Coverage(n, active.size());
    }

    /** The consultant ids of the organization with a live license that carries the add-on now. */
    private Set<Long> licensed(Long orgId) {
        Instant now = Instant.now();
        Set<Long> out = new HashSet<>();
        List<ConsultantLicense> live = licenses.findByOrgIdAndStatusIn(orgId, GRANTING);
        Set<Long> ids = new HashSet<>();
        for (ConsultantLicense l : live) if (current(l.getStartsAt(), l.getEndsAt(), now)) ids.add(l.getId());
        if (ids.isEmpty()) return out;
        Set<Long> licensesWithFeature = new HashSet<>();
        for (LicenseFeature f : features.findByOrgIdAndLicenseIdIn(orgId, ids)) {
            if (FEATURE.equals(f.getFeatureKey()) && Boolean.TRUE.equals(f.getLive()) && current(f.getStartsAt(), f.getEndsAt(), now)) licensesWithFeature.add(f.getLicenseId());
        }
        for (ConsultantLicense l : live) if (licensesWithFeature.contains(l.getId())) out.add(l.getConsultantId());
        return out;
    }

    private static boolean current(Instant start, Instant end, Instant now) {
        return (start == null || !start.isAfter(now)) && (end == null || end.isAfter(now));
    }
}
