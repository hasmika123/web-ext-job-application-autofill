package com.dossier.api.service;

import com.dossier.api.domain.User;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.LoginWorld;
import com.dossier.api.security.LoginWorldProvider;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
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
public class AccountScopes implements LoginWorldProvider {

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

    /** The world of the current request ({@link LoginWorld}). */
    @Override
    public LoginWorld loginWorld() {
        if (!separateAccountsEnabled()) return LoginWorld.LEGACY;
        Long scope = TenantContextHolder.current().filter(TenantContext::isTenant).map(c -> scopeOf(c.orgId())).orElse(null);
        return new LoginWorld(true, scope);
    }

    /**
     * The world check for a token carrying {@code tid} (null for none) on a request with this tenant context (decision O4, docs/enterprise-v2/19 section 1.4):
     * the host of a SEPARATE organization takes only that organization's enterprise tokens; any other host refuses an enterprise token (except an
     * extension token, see below). Switch off: always true.
     */
    public boolean tokenFitsWorld(Long tid, Optional<TenantContext> context) {
        return tokenFitsWorld(tid, false, context);
    }

    /**
     * {@link #tokenFitsWorld(Long, Optional)} for a token that may be an extension token ({@code ext}): an enterprise account's extension token is
     * also accepted on a platform host (the extension calls api.kiwiply.com), where {@code AccountKindRouteFilter} then restricts it to the
     * extension allow-list. On a tenant host the rule is unchanged.
     */
    public boolean tokenFitsWorld(Long tid, boolean ext, Optional<TenantContext> context) {
        if (!separateAccountsEnabled()) return true;
        if (context.isPresent() && context.get().isTenant()) {
            Long hostScope = scopeOf(context.get().orgId());
            return hostScope == null || hostScope.equals(tid);
        }
        return tid == null || ext || scopeOf(tid) == null;
    }

    /** Whether a token's {@code tid} is the right one for an account whose {@code org_id} is {@code accountOrgId} (an enterprise account's tid is its org; a personal token never has an enterprise tid). */
    public boolean tokenFitsAccount(Long tid, Long accountOrgId) {
        if (accountOrgId != null) return accountOrgId.equals(tid);
        return tid == null || scopeOf(tid) == null;
    }
}
