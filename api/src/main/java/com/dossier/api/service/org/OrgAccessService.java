package com.dossier.api.service.org;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ent.OrgRoleService;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one place that decides what an org actor may do (docs/design/org/tenant-model.md decisions 3 and 4).
 *
 * <p><b>Membership is the only key.</b> The caller is resolved from the security context to their ACTIVE
 * {@code org_member} row in the named organization; the role's permission set (section 4) decides the rest. No
 * {@code ROLE_*} authority is consulted: a platform {@code ROLE_ADMIN} who is not a member of the org gets exactly
 * what any stranger gets.
 *
 * <p><b>Everything that fails is a 404.</b> Not a member, an INVITED / SUSPENDED / LEFT / REMOVED / ERASED seat,
 * a role without the permission, an org that does not exist, a malformed id: all throw the same
 * {@link OrgNotFoundException} with the same generic body, so a foreign org id is indistinguishable from a missing
 * one and the response never says "forbidden". Nothing is written to the audit trail for a refused call.
 */
@Service
public class OrgAccessService {

    private static final Logger LOG = LoggerFactory.getLogger(OrgAccessService.class);

    private final UserRepository userRepository;
    private final OrgMemberRepository memberRepository;
    private final OrganizationRepository organizationRepository;
    private final OrgRoleService roleService;

    /** {@code roleService} null (a test that does not exercise enterprise roles) = permissions always come from the legacy enum. */
    public OrgAccessService(
        UserRepository userRepository,
        OrgMemberRepository memberRepository,
        OrganizationRepository organizationRepository,
        OrgRoleService roleService
    ) {
        this.userRepository = userRepository;
        this.memberRepository = memberRepository;
        this.organizationRepository = organizationRepository;
        this.roleService = roleService;
    }

    /** The caller's membership in {@code orgId} if they hold {@code permission} there; otherwise a 404. */
    @Transactional(readOnly = true)
    public OrgMembership require(Long orgId, OrgPermission permission) {
        if (permission == null) throw new IllegalArgumentException("permission is required; use requireMember(orgId) for 'any active member'");
        OrgMembership membership = resolve(orgId).orElseThrow(OrgNotFoundException::new);
        if (!membership.can(permission)) {
            LOG.debug("org access refused: org={} role={} permission={}", orgId, membership.role(), permission.key());
            throw new OrgNotFoundException();
        }
        return membership;
    }

    /** {@link #require} for a list: the caller must hold ALL of them (a handler that needs two permissions). */
    @Transactional(readOnly = true)
    public OrgMembership requireAll(Long orgId, List<OrgPermission> permissions) {
        OrgMembership membership = resolve(orgId).orElseThrow(OrgNotFoundException::new);
        for (OrgPermission p : permissions) {
            if (!membership.can(p)) throw new OrgNotFoundException();
        }
        return membership;
    }

    /** The caller's membership in {@code orgId} when they are an ACTIVE member of any role; otherwise a 404. */
    @Transactional(readOnly = true)
    public OrgMembership requireMember(Long orgId) {
        return resolve(orgId).orElseThrow(OrgNotFoundException::new);
    }

    /** The caller's ACTIVE membership in {@code orgId}, or empty. Never throws for "not a member". */
    @Transactional(readOnly = true)
    public Optional<OrgMembership> resolve(Long orgId) {
        if (orgId == null) return Optional.empty();
        Optional<String> login = SecurityUtils.getCurrentUserLogin();
        if (login.isEmpty()) return Optional.empty();
        Optional<User> user = userRepository.findOneByLogin(login.get());
        if (user.isEmpty()) return Optional.empty();
        List<OrgMember> seats = memberRepository.findByOrgIdAndUserIdAndStatusIn(orgId, user.get().getId(), List.of(OrgMemberStatus.ACTIVE));
        if (seats.isEmpty()) return Optional.empty();
        OrgMember seat = seats.get(0);
        Optional<Organization> org = organizationRepository.findByOrgId(orgId);
        if (org.isEmpty() || seat.getRole() == null || seat.getRole().isReserved()) return Optional.empty();
        // Enterprise V2 (X1.6): with flag.enterprise.roles on for this org the permissions come from the member's role rows; any doubt
        // (no rows, drift from the enum, no permission rows) keeps the legacy enum answer for legacy shared-account organizations only.
        // X4.10: an enterprise (SEPARATE-accounts) organization reads its roles from data ALONE: no role rows, no permissions, whatever the
        // enum says. Only the legacy shared-account organizations (account_mode SHARED) keep the enum answer as their fallback.
        boolean enterprise = org.get().isSeparateAccounts();
        Optional<OrgRoleService.RoleGrants> data = roleService == null
            ? Optional.empty()
            : enterprise ? roleService.resolveAuthoritativeGrants(orgId, seat) : roleService.resolveGrants(orgId, seat);
        if (enterprise && data.isEmpty()) {
            LOG.warn("org {} member {}: no usable role rows for an enterprise organization; granting nothing", orgId, seat.getId());
            return Optional.empty();
        }
        if (data.isPresent()) {
            return Optional.of(
                new OrgMembership(
                    orgId, seat.getId(), user.get().getId(), login.get(), seat.getRole(), seat.getStatus(), org.get().getStatus(),
                    data.get().roles(), data.get().grants()
                )
            );
        }
        return Optional.of(
            new OrgMembership(orgId, seat.getId(), user.get().getId(), login.get(), seat.getRole(), seat.getStatus(), org.get().getStatus())
        );
    }
}
