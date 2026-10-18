package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgRole;
import java.time.Instant;
import java.util.List;

/**
 * Direct account creation by an Org Admin (employee onboarding with a temporary password). The roles and placement are exactly the
 * invitation form's, validated by the same code (role ceiling, groups, manager). {@code password} is optional: the form shows a
 * server-generated one (GET temp-password) and sends it back, possibly overwritten; the server checks it against the platform
 * password rules and never stores it in clear text, logs it, audits it or returns it again.
 */
public final class OrgAccountDTOs {

    private OrgAccountDTOs() {}

    public record CreateRequest(
        String email,
        String fullName,
        String password,
        List<Long> roleIds,
        OrgRole role,
        Long departmentGroupId,
        Long teamGroupId,
        Long managerMemberId,
        Long groupId,
        Long supportOwnerMemberId
    ) {}

    /**
     * {@code mode} is {@code ACCOUNT_CREATED} (a new account, active at once, must change the temporary password) or {@code INVITED}
     * (the address already has a Kiwiply account: it keeps its own password and gets the normal invitation to accept).
     * {@code tempPassword} is set only when the server generated the password because none was sent; otherwise the caller already holds it.
     */
    public record CreateResult(Long memberId, String email, String mode, String tempPassword, Instant tempPasswordExpiresAt, List<Long> roleIds) {}

    public record ResetRequest(String reason) {}

    public record ResetResult(Long memberId, String email, String tempPassword, Instant tempPasswordExpiresAt) {}

    /** A fresh server-generated password for the form to show (nothing is stored). */
    public record Suggestion(String password) {}
}
