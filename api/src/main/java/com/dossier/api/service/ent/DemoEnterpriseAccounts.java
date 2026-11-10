package com.dossier.api.service.ent;

import com.dossier.api.domain.User;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.UserService;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * How the demo seeders create a person of a SEPARATE organization (decision O4, docs/enterprise-v2/19 S10): always an ENTERPRISE account of that organization
 * through {@link UserService#createEnterpriseAccount} (login {@code ent#<orgId>#...}, ROLE_USER only), never a personal lookup and never a {@code demo-ent-}
 * login. Legacy SHARED demo organizations keep their synthetic demo-login users and do not use this class. Idempotent per (organization, address).
 */
@Component
public class DemoEnterpriseAccounts {

    private final UserService userService;
    private final UserRepository users;

    public DemoEnterpriseAccounts(UserService userService, UserRepository users) {
        this.userService = userService;
        this.users = users;
    }

    /**
     * The enterprise account of {@code orgId} for {@code email}: created when missing, otherwise kept and given {@code password} again (activated,
     * no longer temporary), so the demo password stays stable across restarts.
     */
    @Transactional
    public User ensure(Long orgId, String firstName, String lastName, String email, String password) {
        User existing = users.findOneByOrgIdAndEmailIgnoreCase(orgId, email).orElse(null);
        if (existing != null) {
            userService.setEnterprisePassword(existing, password);
            return existing;
        }
        return userService.createEnterpriseAccount(orgId, email, firstName, lastName, password, null).user();
    }
}
