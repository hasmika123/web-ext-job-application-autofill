package com.dossier.api.service;

import com.dossier.api.domain.User;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Which account world an email lookup belongs to (decision O4, docs/enterprise-v2/19). A scope is an organization id, or {@code null} for the
 * personal world. The personal world is the answer unless the platform switch {@code enterprise.separate_accounts} is on AND the organization's
 * {@code account_mode} is SEPARATE, so with the switch off (the default) or for a legacy SHARED organization every lookup is exactly the personal
 * lookup it was before. Fails closed: a settings or database error reads as "personal".
 */
@Service
public class AccountScopes {

    private static final Logger LOG = LoggerFactory.getLogger(AccountScopes.class);

    private final ResumeBuilderSettings settings;
    private final OrganizationRepository organizations;
    private final UserRepository users;

    public AccountScopes(ResumeBuilderSettings settings, OrganizationRepository organizations, UserRepository users) {
        this.settings = settings;
        this.organizations = organizations;
        this.users = users;
    }

    /** True while the platform switch {@code enterprise.separate_accounts} is on. */
    public boolean separateAccountsEnabled() {
        try {
            return settings.getBool(EnterpriseSettingKeys.SEPARATE_ACCOUNTS);
        } catch (RuntimeException e) {
            LOG.warn("enterprise.separate_accounts could not be read ({}); treating it as off", e.getClass().getSimpleName());
            return false;
        }
    }

    /** The scope of {@code orgId}'s members: the organization id when its accounts are separate (switch on and SEPARATE), otherwise null (personal). */
    public Long scopeOf(Long orgId) {
        if (orgId == null || !separateAccountsEnabled()) return null;
        try {
            return organizations.findByOrgId(orgId).filter(Organization::isSeparateAccounts).map(Organization::getId).orElse(null);
        } catch (RuntimeException e) {
            LOG.warn("account scope of organization {} could not be resolved ({}); using the personal scope", orgId, e.getClass().getSimpleName());
            return null;
        }
    }

    /** The account with {@code email} among {@code orgId}'s members' accounts (see {@link #scopeOf}). */
    public Optional<User> findMemberAccountByEmail(Long orgId, String email) {
        return users.findOneByScopeAndEmail(scopeOf(orgId), email);
    }
}
