package com.dossier.api.service.ent.members;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.RefreshTokenService;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.org.OrgAuditService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What a seat change means for the ENTERPRISE account behind it (decision O4, docs/enterprise-v2/19 phase S8). An enterprise account belongs to one
 * organization for life, so when its seat is suspended or ended the account is <b>disabled</b>: sign-in is already refused by the seat check
 * ({@code NOT_A_MEMBER}), a refresh is refused for the same reason, and here every stored refresh token of the account is revoked at once (browser and
 * extension alike, they share the table), so nothing can keep rotating. An access token already issued is refused by
 * {@code EnterpriseSeatFilter} on the next call, not after it expires. Reinstating a suspended person needs no flag to flip: the seat is active
 * again and the person signs in anew.
 *
 * <p>Only an account whose {@code org_id} is this organization qualifies. A seat of a legacy SHARED organization points at a personal account, which
 * is never disabled or revoked by an organization (the person's own sessions are theirs): {@link #accountOf} answers empty and every method here is a no-op.
 *
 * <p>The audit rows (HIGH for disable, MEDIUM for enable) name the actor, the organization, the seat and the mode. They never carry an address, a
 * login or a secret.
 */
@Service
public class EnterpriseAccountLifecycle {

    private final UserRepository users;
    private final OrgMemberRepository members;
    private final RefreshTokenService tokens;
    private final OrgAuditService audit;
    private final ResumeBuilderSettings settings;

    public EnterpriseAccountLifecycle(UserRepository users, OrgMemberRepository members, RefreshTokenService tokens, OrgAuditService audit, ResumeBuilderSettings settings) {
        this.users = users;
        this.members = members;
        this.tokens = tokens;
        this.audit = audit;
        this.settings = settings;
    }

    /** The enterprise account behind {@code seat} when it belongs to {@code orgId}; empty for an unfilled seat or a personal account. */
    public Optional<User> accountOf(Long orgId, OrgMember seat) {
        if (orgId == null || seat == null || seat.getUserId() == null) return Optional.empty();
        return users.findById(seat.getUserId()).filter(u -> orgId.equals(u.getOrgId()));
    }

    /** Days a disabled account is kept before it is erased ({@code org.account.retentionDays}, default 90). */
    public int retentionDays() {
        return settings.getInt(ResumeBuilderSettingKeys.ORG_ACCOUNT_RETENTION_DAYS);
    }

    /** The instant a person offboarded at {@code leftAt} is erased. */
    public Instant eraseOn(Instant leftAt) {
        return leftAt.plus(Duration.ofDays(retentionDays()));
    }

    /** True while {@code userId} holds an ACTIVE seat in {@code orgId}: the condition for any enterprise token to work. */
    @Transactional(readOnly = true)
    public boolean hasActiveSeat(Long orgId, Long userId) {
        return orgId != null && userId != null && !members.findByOrgIdAndUserIdAndStatusIn(orgId, userId, List.of(OrgMemberStatus.ACTIVE)).isEmpty();
    }

    /**
     * Disables the enterprise account behind {@code seat}: every refresh token is revoked and one HIGH audit row is written. {@code mode} is
     * {@code SUSPEND} or {@code OFFBOARD}. A no-op (returns false) for a seat with no enterprise account.
     */
    @Transactional
    public boolean disable(Long orgId, OrgMember seat, String actorLogin, OrgRole actorRole, String mode) {
        Optional<User> account = accountOf(orgId, seat);
        if (account.isEmpty()) return false;
        int revoked = tokens.revokeAllForUser(account.get().getId());
        audit.record(
            orgId, actorLogin, actorRole, MemberAuditActions.ACCOUNT_DISABLED, OrgAuditService.TARGET_MEMBER, null, String.valueOf(seat.getId()),
            "{\"mode\":\"" + mode + "\",\"sessionsRevoked\":" + revoked + "}", null, null, null, "HIGH"
        );
        return true;
    }

    /** The reverse of a suspension: the seat is active again, so the account works again. Audit only (MEDIUM). */
    @Transactional
    public boolean enable(Long orgId, OrgMember seat, String actorLogin, OrgRole actorRole) {
        if (accountOf(orgId, seat).isEmpty()) return false;
        audit.record(
            orgId, actorLogin, actorRole, MemberAuditActions.ACCOUNT_ENABLED, OrgAuditService.TARGET_MEMBER, null, String.valueOf(seat.getId()),
            "{\"mode\":\"REINSTATE\"}", null, null, null, "MEDIUM"
        );
        return true;
    }
}
