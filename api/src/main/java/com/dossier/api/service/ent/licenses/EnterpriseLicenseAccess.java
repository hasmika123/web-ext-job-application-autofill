package com.dossier.api.service.ent.licenses;

import com.dossier.api.config.Constants;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The licence of an enterprise ACCOUNT (login {@code ent#<orgId>#...}, decision O4): the bridge between code that only knows a login (the AI budget, the
 * resume builder) and {@link OrgLicenseGate}, which knows organizations and consultants (LICENCES-BUILD.md L2).
 *
 * <p>The organization comes from the login itself, never from a client. The seat must be ACTIVE, the organization ACTIVE or PAST_DUE (it keeps working
 * until it is suspended, doc 24 step 3), and the person an ACTIVE consultant there; otherwise nothing is granted. A personal login always answers "no":
 * a personal account's grants are its own plan, which this class never reads.
 */
@Service
@Transactional(readOnly = true)
public class EnterpriseLicenseAccess {

    /** Where an enterprise account holds its licence. */
    public record Seat(Long orgId, Long memberId, Long consultantId) {}

    private final UserRepository users;
    private final OrgMemberRepository members;
    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final OrgLicenseGate gate;

    public EnterpriseLicenseAccess(
        UserRepository users,
        OrgMemberRepository members,
        OrganizationRepository orgs,
        ConsultantProfileRepository consultants,
        OrgLicenseGate gate
    ) {
        this.users = users;
        this.members = members;
        this.orgs = orgs;
        this.consultants = consultants;
        this.gate = gate;
    }

    /** The organization named by an enterprise login, or empty for any other login. */
    public static Optional<Long> orgOf(String login) {
        if (!Constants.isEnterpriseLogin(login)) return Optional.empty();
        int second = login.indexOf('#', Constants.ENTERPRISE_LOGIN_PREFIX.length());
        if (second < 0) return Optional.empty();
        try {
            return Optional.of(Long.parseLong(login.substring(Constants.ENTERPRISE_LOGIN_PREFIX.length(), second)));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    /** The live consultant seat of an enterprise account, or empty (personal login, seat not ACTIVE, organization closed, not a consultant). */
    public Optional<Seat> seatOf(String login) {
        Optional<Long> orgId = orgOf(login);
        if (orgId.isEmpty()) return Optional.empty();
        Long userId = users.findOneByLogin(login).map(u -> u.getId()).orElse(null);
        if (userId == null) return Optional.empty();
        boolean orgLive = orgs.findByOrgId(orgId.get()).map(o -> o.getStatus() == OrgStatus.ACTIVE || o.getStatus() == OrgStatus.PAST_DUE).orElse(false);
        if (!orgLive) return Optional.empty();
        for (OrgMember seat : members.findMine(userId)) {
            if (!orgId.get().equals(seat.getOrgId()) || seat.getStatus() != OrgMemberStatus.ACTIVE) continue;
            Optional<ConsultantProfile> profile = consultants.findByOrgIdAndMemberId(orgId.get(), seat.getId());
            if (profile.isPresent() && "ACTIVE".equals(profile.get().getStatus())) return Optional.of(new Seat(orgId.get(), seat.getId(), profile.get().getId()));
        }
        return Optional.empty();
    }

    /** Whether the enterprise account's live licence carries {@code featureKey}. Always false for a personal login. */
    public boolean has(String login, String featureKey) {
        return seatOf(login).map(s -> gate.has(s.orgId(), s.consultantId(), featureKey)).orElse(false);
    }

    /** Whether the enterprise account's live licence carries any of {@code featureKeys}. Always false for a personal login. */
    public boolean hasAny(String login, Set<String> featureKeys) {
        return seatOf(login).map(s -> gate.hasAny(s.orgId(), s.consultantId(), featureKeys)).orElse(false);
    }

    /** The enterprise account's monthly AI budget from its licence, in cents (0 = no server AI). Always 0 for a personal login. */
    public long aiBudgetCents(String login) {
        return seatOf(login).map(s -> gate.aiBudgetCents(s.orgId(), s.consultantId())).orElse(0L);
    }
}
