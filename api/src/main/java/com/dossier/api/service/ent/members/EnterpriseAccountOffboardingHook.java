package com.dossier.api.service.ent.members;

import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.dto.ent.MemberActionDTO;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Offboarding step 150 (decision O4, docs/enterprise-v2/19 phase S8): the person's ENTERPRISE account is disabled and every session of it revoked
 * (browser and extension), so nothing can rotate a refresh token or keep working. The mailbox connection made in that account is purged by the inbox
 * step (450); the lines here tell the administrator, in general terms, what the whole offboarding does to the account, without saying whether a mailbox
 * was ever connected. The account and its data are kept for the retention window ({@code org.account.retentionDays}) so the person can still be given
 * an export, then erased by the retention job.
 *
 * <p>For a seat that points at a personal account (a legacy SHARED organization) the step says nothing and does nothing.
 */
@Component
public class EnterpriseAccountOffboardingHook implements OffboardingHook {

    private final OrgMemberRepository members;
    private final EnterpriseAccountLifecycle accounts;

    public EnterpriseAccountOffboardingHook(OrgMemberRepository members, EnterpriseAccountLifecycle accounts) {
        this.members = members;
        this.accounts = accounts;
    }

    @Override
    public int getOrder() {
        return ORDER_ACCOUNT;
    }

    @Override
    public String key() {
        return "account";
    }

    @Override
    public List<MemberActionDTO.HookLine> preview(Long orgId, Long memberId) {
        Optional<OrgMember> seat = members.findByOrgIdAndId(orgId, memberId);
        if (seat.isEmpty() || accounts.accountOf(orgId, seat.get()).isEmpty()) return List.of();
        int days = accounts.retentionDays();
        LocalDate eraseOn = accounts.eraseOn(Instant.now()).atZone(ZoneOffset.UTC).toLocalDate();
        Map<String, Object> retention = new LinkedHashMap<>();
        retention.put("retentionDays", days);
        retention.put("eraseOn", eraseOn.toString());
        return List.of(
            new MemberActionDTO.HookLine(key(), "ACCOUNT", "Their organization account is disabled and signed out everywhere, including the browser extension", Map.of()),
            new MemberActionDTO.HookLine(key(), "ACCOUNT_INBOX", "Any mailbox connection in this account is removed, with the mail stored from it", Map.of()),
            new MemberActionDTO.HookLine(
                key(), "ACCOUNT_RETENTION",
                "The account and its data are kept for " + days + " days so an export can still be given, then erased on " + eraseOn,
                retention
            )
        );
    }

    @Override
    public void apply(Context context) {
        members.findByOrgIdAndId(context.orgId(), context.memberId()).ifPresent(seat -> accounts.disable(context.orgId(), seat, context.actorLogin(), null, "OFFBOARD"));
    }
}
