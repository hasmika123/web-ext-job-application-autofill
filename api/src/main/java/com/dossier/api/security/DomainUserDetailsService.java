package com.dossier.api.security;

import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.repository.UserRepository;
import org.springframework.beans.factory.ObjectProvider;
import java.util.*;
import org.hibernate.validator.internal.constraintvalidators.hv.EmailValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Authenticate a user from the database.
 */
@Component("userDetailsService")
public class DomainUserDetailsService implements UserDetailsService {

    private static final Logger LOG = LoggerFactory.getLogger(DomainUserDetailsService.class);

    private final UserRepository userRepository;
    // Optional so a hand-wired slice without the account-scope service keeps the legacy (personal) lookups.
    private final ObjectProvider<LoginWorldProvider> accountScopes;

    public DomainUserDetailsService(UserRepository userRepository, ObjectProvider<LoginWorldProvider> accountScopes) {
        this.userRepository = userRepository;
        this.accountScopes = accountScopes;
    }

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(final String login) {
        LOG.debug("Authenticating {}", login);

        // O4 (docs/enterprise-v2/19 1.4): the HOST decides the world. Switch off: the legacy lookups. Switch on: a SEPARATE organization's tenant host
        // sees that organization's enterprise accounts only, every other host sees personal accounts only. An account of the other world is simply "not
        // found" here, so it ends in the same BadCredentialsException (and the provider's dummy-hash timing) as an unknown user.
        LoginWorldProvider scopes = accountScopes.getIfAvailable();
        LoginWorld world = scopes == null ? LoginWorld.LEGACY : scopes.loginWorld();

        // an enterprise login (ent#<orgId>#<email>) is a login even though it looks like an address
        boolean enterpriseLogin = login != null && login.strip().toLowerCase(Locale.ROOT).startsWith("ent#");
        if (!enterpriseLogin && new EmailValidator().isValid(login, null)) {
            return (world.enterprise()
                    ? userRepository.findOneWithAuthoritiesByOrgIdAndEmailIgnoreCase(world.orgId(), login)
                    : userRepository.findOneWithAuthoritiesByOrgIdIsNullAndEmailIgnoreCase(login))
                .map(user -> createSpringSecurityUser(login, user))
                .orElseThrow(() -> new UsernameNotFoundException("User with email " + login + " was not found in the database"));
        }

        String lowercaseLogin = login.toLowerCase(Locale.ENGLISH);
        return userRepository
            .findOneWithAuthoritiesByLogin(lowercaseLogin)
            .filter(user -> !world.enforced() || Objects.equals(user.getOrgId(), world.orgId()))
            .map(user -> createSpringSecurityUser(lowercaseLogin, user))
            .orElseThrow(() -> new UsernameNotFoundException("User " + lowercaseLogin + " was not found in the database"));
    }

    private org.springframework.security.core.userdetails.User createSpringSecurityUser(String lowercaseLogin, User user) {
        if (!user.isActivated()) {
            throw new UserNotActivatedException("User " + lowercaseLogin + " was not activated");
        }
        return UserWithId.fromUser(user);
    }

    public static class UserWithId extends org.springframework.security.core.userdetails.User {

        private final Long id;
        private Long orgId;
        private boolean passwordChangeRequired;
        private boolean tempPasswordExpired;

        public UserWithId(String login, String password, Collection<? extends GrantedAuthority> authorities, Long id) {
            super(login, password, authorities);
            this.id = id;
        }

        /** True while the account holds an administrator-issued temporary password (the session may only change it). */
        public boolean isPasswordChangeRequired() {
            return passwordChangeRequired;
        }

        /** True when that temporary password has run out: sign-in is refused until an administrator issues a new one. */
        public boolean isTempPasswordExpired() {
            return tempPasswordExpired;
        }

        public Long getId() {
            return id;
        }

        /** The organization this ENTERPRISE account belongs to, or null for a personal account. */
        public Long getOrgId() {
            return orgId;
        }

        @Override
        public boolean equals(Object obj) {
            return super.equals(obj);
        }

        @Override
        public int hashCode() {
            return super.hashCode();
        }

        public static UserWithId fromUser(User user) {
            UserWithId principal = new UserWithId(
                user.getLogin(),
                user.getPassword(),
                user.getAuthorities().stream().map(Authority::getName).map(SimpleGrantedAuthority::new).toList(),
                user.getId()
            );
            principal.orgId = user.getOrgId();
            principal.passwordChangeRequired = user.isPasswordChangeRequired();
            principal.tempPasswordExpired = user.isPasswordChangeRequired() && user.getPasswordTempExpiresAt() != null && user.getPasswordTempExpiresAt().isBefore(java.time.Instant.now());
            return principal;
        }
    }
}
