package com.dossier.api.service.ent.licenses;

import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.service.dto.ent.MemberActionDTO;
import com.dossier.api.service.ent.members.OffboardingHook;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Offboarding step 500 (doc 15 section 5; LICENCES-BUILD.md L5): a person who leaves the organization has their consultant licence ended now, with every
 * add-on, so nothing keeps granting AI, the inbox or Autopilot to a seat that is gone. The rows are kept (history), with end reason {@code MEMBER_LEFT}.
 * A member who is not a consultant, or holds no licence, is skipped; the preview says so only when there is a licence to end.
 */
@Component
public class LicenseOffboardingHook implements OffboardingHook {

    private final ConsultantProfileRepository consultants;
    private final OrgLicenseGate gate;
    private final OrgLicenseService licenses;

    public LicenseOffboardingHook(ConsultantProfileRepository consultants, OrgLicenseGate gate, OrgLicenseService licenses) {
        this.consultants = consultants;
        this.gate = gate;
        this.licenses = licenses;
    }

    @Override
    public int getOrder() {
        return ORDER_LICENSES;
    }

    @Override
    public String key() {
        return "licenses";
    }

    @Override
    public List<MemberActionDTO.HookLine> preview(Long orgId, Long memberId) {
        Long consultantId = consultants.findByOrgIdAndMemberId(orgId, memberId).map(c -> c.getId()).orElse(null);
        if (consultantId == null || gate.liveLicense(orgId, consultantId).isEmpty()) return List.of();
        return List.of(new MemberActionDTO.HookLine(key(), "LICENSE", "Their consultant licence and its add-ons end now", Map.of()));
    }

    @Override
    public void apply(Context context) {
        consultants
            .findByOrgIdAndMemberId(context.orgId(), context.memberId())
            .ifPresent(c -> licenses.endForSeat(context.orgId(), c.getId(), "MEMBER_LEFT", null));
    }
}
