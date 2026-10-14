package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.consultant.ConProfileRepository;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * The one gate every consultant endpoint (`/api/orgs/{orgId}/con/**`, packages named {@code consultant}) goes through (doc 60 section 2).
 *
 * <p>Gate, every miss the same generic 404 ({@link OrgNotFoundException}, never a 403): roles are read from data for the org, the
 * {@code flag.enterprise.consultant_jobs} flag is on for it (read directly: there is no ninth tenant module), the caller holds
 * {@code opportunities.respond} (OWN scope, fixed authorization order of {@link AuthorizationService}), and the caller's seat has exactly ONE
 * {@code consultant_profile(org_id, member_id)} whose {@code status} is ACTIVE.
 *
 * <p>The consultant id is resolved HERE from the seat. It is never a request value: a consultant only ever sees and changes rows of their own profile,
 * so another consultant's opportunity id is a 404 by construction. E1: nothing behind this gate submits anything for anyone.
 */
@Service
public class ConScope {

    public static final String PERMISSION = "opportunities.respond";

    /** Who is asking: the seat, the account behind it, and the consultant profile that seat owns. */
    public record View(Long orgId, Long memberId, Long userId, Long consultantId) {}

    private final OrgRoleService roles;
    private final EnterpriseFeatureFlag flags;
    private final AuthorizationService authorization;
    private final ConProfileRepository profiles;

    public ConScope(OrgRoleService roles, EnterpriseFeatureFlag flags, AuthorizationService authorization, ConProfileRepository profiles) {
        this.roles = roles;
        this.flags = flags;
        this.authorization = authorization;
        this.profiles = profiles;
    }

    /** Gate for a read (a past-due or closed organization still answers). */
    public View read(OrgMembership me) {
        return resolve(me, AuthzOperation.READ);
    }

    /** Gate for a write (the organization's state decides, see {@code OrgStateRules}). */
    public View write(OrgMembership me) {
        return resolve(me, AuthzOperation.WRITE);
    }

    public View resolve(OrgMembership me, AuthzOperation operation) {
        if (me == null || me.orgId() == null || me.memberId() == null) throw new OrgNotFoundException();
        Long orgId = me.orgId();
        if (!roles.rolesFromData(orgId) || !flags.isEnabled(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, orgId)) throw new OrgNotFoundException();
        if (me.scopeFor(PERMISSION).isEmpty()) throw new OrgNotFoundException();
        authorization.require(AuthzRequest.of(orgId, List.of(PERMISSION), Beneficiary.SELF, null, operation).withActor(me));
        List<ConsultantProfile> mine = profiles.findByOrgIdAndMemberId(orgId, me.memberId());
        if (mine.size() != 1) throw new OrgNotFoundException(); // no profile, or an ambiguous seat: nobody's rows
        ConsultantProfile profile = mine.get(0);
        if (!"ACTIVE".equals(profile.getStatus()) || profile.getId() == null) throw new OrgNotFoundException();
        return new View(orgId, me.memberId(), me.userId(), profile.getId());
    }
}
