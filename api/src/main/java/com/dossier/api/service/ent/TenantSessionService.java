package com.dossier.api.service.ent;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.org.InviteTokens;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * Tenant-bound sessions (X1.5, ADR-004, 04-tenancy-and-security.md section 3). Decides, at sign-in and at refresh, whether a
 * session carries {@code tid}/{@code hid}. The tenant is the one {@link TenantResolver} derived from the forwarded host (the
 * request-scoped {@link TenantContextHolder}); the client never names one.
 *
 * <ul>
 *   <li>TENANT host: the user must hold an ACTIVE, non-reserved seat in that organization, else {@code 403 NOT_A_MEMBER}
 *       (the only non-404 on a tenant host: the login page needs it) and a {@code LOGIN_DENIED_NOT_MEMBER} audit row in
 *       the tenant's own trail. Success binds the session.</li>
 *   <li>PLATFORM host, or no host (the extension, scripts, today's web): no binding, today's behaviour.</li>
 *   <li>A host that was given but is not served: 404, fail closed.</li>
 * </ul>
 *
 * Deliberately not {@code @Transactional}: the denial audit row must commit even though the call then throws.
 */
@Service
public class TenantSessionService {

    private final OrgMemberRepository members;
    private final OrgAuditService audit;

    public TenantSessionService(OrgMemberRepository members, OrgAuditService audit) {
        this.members = members;
        this.audit = audit;
    }

    /** The binding for a sign-in by {@code userId} (login {@code login}) on the current request's host, or empty when unbound. */
    public Optional<TenantBinding> bindingForLogin(Long userId, String login) {
        return bindingForLogin(userId, login, null, false);
    }

    /**
     * As above, plus the invitation exception of 12-identity.md section 5 (X1.8): on a TENANT host a person with NO active seat is
     * still signed in, WITHOUT {@code tid}, when {@code inviteToken} (the {@code X-Kiwiply-Invite} header) is a live pending invite
     * of THIS organization. That token can then only reach the join endpoints ({@code TenantTokenBindingFilter}); accepting
     * returns the tenant-bound pair, so "no member, no tenant session" stays true. {@code auditInvite} writes the
     * {@code LOGIN_FOR_INVITE} row (the caller passes true once per sign-in). A wrong, spent, expired, revoked or foreign token
     * is treated as no token at all: the ordinary {@code 403 NOT_A_MEMBER}.
     */
    public Optional<TenantBinding> bindingForLogin(Long userId, String login, String inviteToken, boolean auditInvite) {
        Optional<TenantContext> context = TenantContextHolder.current();
        if (context.isEmpty()) return Optional.empty();
        TenantContext c = context.get();
        if (c.isExplicitlyUnknown()) throw new OrgNotFoundException();
        if (!c.isTenant()) return Optional.empty();
        if (!isActiveMember(c.orgId(), userId)) {
            if (hasLiveInvite(c.orgId(), inviteToken)) {
                if (auditInvite) audit.recordHostEvent(c.orgId(), c.hostnameId(), login, OrgAuditService.LOGIN_FOR_INVITE, "LOW", "sign-in for a pending invitation (no tenant session until it is accepted)");
                return Optional.empty();
            }
            audit.recordHostEvent(c.orgId(), c.hostnameId(), login, OrgAuditService.LOGIN_DENIED_NOT_MEMBER, "MEDIUM", "sign-in refused: no active seat");
            throw OrgException.notAMember();
        }
        return Optional.of(new TenantBinding(c.orgId(), c.hostnameId()));
    }

    private boolean hasLiveInvite(Long orgId, String token) {
        if (token == null || !InviteTokens.looksLikeToken(token)) return false;
        return members
            .findByInviteTokenHash(InviteTokens.hash(token))
            .filter(s -> s.getStatus() == OrgMemberStatus.INVITED && orgId.equals(s.getOrgId()))
            .filter(s -> s.getInviteExpiresAt() == null || s.getInviteExpiresAt().isAfter(java.time.Instant.now()))
            .isPresent();
    }

    /**
     * Whether a refresh token bound to {@code tid} may be exchanged now: on a tenant host the host must be that tenant, a host
     * that is given but not served never qualifies, and the seat must still be active (a removed or suspended person loses
     * the session at the next refresh).
     */
    public boolean refreshAllowed(Long tid, Long userId) {
        if (tid == null) return true;
        Optional<TenantContext> context = TenantContextHolder.current();
        if (context.isPresent()) {
            TenantContext c = context.get();
            if (c.isExplicitlyUnknown()) return false;
            if (c.isTenant() && !tid.equals(c.orgId())) return false;
        }
        return isActiveMember(tid, userId);
    }

    private boolean isActiveMember(Long orgId, Long userId) {
        if (orgId == null || userId == null) return false;
        List<OrgMember> seats = members.findByOrgIdAndUserIdAndStatusIn(orgId, userId, List.of(OrgMemberStatus.ACTIVE));
        return !seats.isEmpty() && seats.get(0).getRole() != null && !seats.get(0).getRole().isReserved();
    }
}
