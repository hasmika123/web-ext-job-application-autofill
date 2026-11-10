package com.dossier.api.service.ent;

import com.dossier.api.repository.ent.AccountModeQueryRepository;
import com.dossier.api.service.dto.AdminAccountDTOs.AccountHealth;
import com.dossier.api.service.dto.AdminAccountDTOs.Invariant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The invariants of the separate-accounts model (decision O4, docs/enterprise-v2/19 section 1.3), as a read-only health query: each one is a count of rows that
 * break it, so {@code 0} everywhere means healthy. Counts only (no address, login or name). The same list backs {@code EnterpriseAccountInvariantIT} and the
 * admin endpoint {@code GET /api/admin/enterprise-accounts/health}.
 */
@Service
public class EnterpriseAccountInvariants {

    private final AccountModeQueryRepository query;

    public EnterpriseAccountInvariants(AccountModeQueryRepository query) {
        this.query = query;
    }

    @Transactional(readOnly = true)
    public AccountHealth check() {
        List<Invariant> all = List.of(
            new Invariant("ENTERPRISE_ACCOUNT_HAS_SEAT", "Every enterprise account has a seat row in its one organization (a live seat, or an ended one that anchors the retention window)", query.countEnterpriseAccountsWithoutSeat()),
            new Invariant("ONE_ACCOUNT_PER_ADDRESS_PER_ORG", "No two enterprise accounts of one organization share an address", query.countDuplicateEnterpriseEmails()),
            new Invariant("ENTERPRISE_ACCOUNT_HAS_NO_PLAN", "No enterprise account owns a personal subscription row", query.countEnterpriseAccountsWithSubscription()),
            new Invariant("PERSONAL_ACCOUNT_HAS_NO_ENT_LOGIN", "No personal account has a login in the ent# namespace", query.countPersonalAccountsWithEnterpriseLogin()),
            new Invariant("ENTERPRISE_LOGIN_NAMES_ITS_ORG", "Every enterprise account login names its own organization (ent#<orgId>#...)", query.countEnterpriseAccountsWithForeignLogin()),
            new Invariant("SEPARATE_ORG_SEATS_ON_ENTERPRISE_ACCOUNTS", "Every live seat of a SEPARATE organization points at an enterprise account of that organization", query.countSeparateSeatsOnWrongAccount()),
            new Invariant("NO_SEAT_ON_FOREIGN_ENTERPRISE_ACCOUNT", "No seat points at the enterprise account of another organization", query.countSeatsOnForeignEnterpriseAccount()),
            new Invariant("ENTERPRISE_ACCOUNT_IS_ROLE_USER_ONLY", "No enterprise account holds an authority other than ROLE_USER", query.countEnterpriseAccountsWithPrivilegedAuthority())
        );
        long total = all.stream().mapToLong(Invariant::violations).sum();
        return new AccountHealth(total == 0, total, all);
    }
}
