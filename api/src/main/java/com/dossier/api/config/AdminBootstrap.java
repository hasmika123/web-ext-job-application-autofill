package com.dossier.api.config;

import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates (or promotes) the real admin account from env at startup — Phase 9.A0 security gate.
 *
 * The default {@code admin}/{@code admin} seed is gone from production (see the Liquibase
 * changesets noted on {@link AdminBootstrapProperties}); this runner installs a real admin from
 * {@code ADMIN_EMAIL} + {@code ADMIN_PASSWORD_HASH} instead, so no credential is committed. It
 * runs on every boot, so updating the env hash and restarting rotates the admin password.
 *
 * <p><strong>Ordering:</strong> this must run <em>after</em> Liquibase migrations (it reads/writes
 * {@code jhi_user}). JHipster starts Liquibase asynchronously by default, which would race an
 * {@link ApplicationRunner}; prod therefore sets {@code application.liquibase.async-start=false}
 * (application-prod.yml) so migrations finish during context refresh, before this runs.
 *
 * <p>Defensive by design: a blank/invalid env value is logged and skipped rather than crashing
 * startup — a typo in {@code ADMIN_PASSWORD_HASH} must never brick the API for regular users.
 */
@Component
public class AdminBootstrap implements ApplicationRunner {

    private static final Logger LOG = LoggerFactory.getLogger(AdminBootstrap.class);

    private final AdminBootstrapProperties props;
    private final UserRepository userRepository;
    private final AuthorityRepository authorityRepository;

    public AdminBootstrap(AdminBootstrapProperties props, UserRepository userRepository, AuthorityRepository authorityRepository) {
        this.props = props;
        this.userRepository = userRepository;
        this.authorityRepository = authorityRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        try {
            bootstrapAdmin();
        } catch (RuntimeException e) {
            // Never let a bad env value crash startup — the API must keep serving regular users.
            LOG.error("Admin bootstrap failed; no admin was created/updated. Fix ADMIN_EMAIL/ADMIN_PASSWORD_HASH and restart.", e);
        }
    }

    void bootstrapAdmin() {
        String email = trim(props.getEmail());
        String hash = trim(props.getPasswordHash());
        String login = trim(props.getLogin()).toLowerCase(Locale.ENGLISH);

        if (email.isEmpty() || hash.isEmpty()) {
            LOG.info("Admin bootstrap skipped: ADMIN_EMAIL and/or ADMIN_PASSWORD_HASH are not set.");
            return;
        }
        if (!isBcryptHash(hash)) {
            LOG.error(
                "Admin bootstrap skipped: ADMIN_PASSWORD_HASH is not a bcrypt hash " +
                "(expected a $2a$/$2b$/$2y$-prefixed 60-character string). No admin created/updated."
            );
            return;
        }
        final String adminLogin = login.isEmpty() ? "admin" : login;
        if (adminLogin.length() > 50 || email.length() > 254) {
            LOG.error("Admin bootstrap skipped: ADMIN_LOGIN (>50) or ADMIN_EMAIL (>254) exceeds the allowed length.");
            return;
        }

        // Match an existing account by email first (the stable identity), then by login.
        User user = userRepository
            .findOneByEmailIgnoreCase(email)
            .or(() -> userRepository.findOneByLogin(adminLogin))
            .orElse(null);
        boolean creating = user == null;
        if (creating) {
            user = new User();
            user.setLogin(adminLogin);
            user.setFirstName("Admin");
            user.setLangKey("en");
        }
        user.setEmail(email);
        user.setPassword(hash);
        user.setActivated(true);

        Set<Authority> authorities = user.getAuthorities();
        authorities.add(findOrCreateAuthority(AuthoritiesConstants.ADMIN));
        authorities.add(findOrCreateAuthority(AuthoritiesConstants.USER));

        userRepository.save(user);
        LOG.warn("Admin bootstrap: {} admin account login='{}' email='{}' with ROLE_ADMIN.", creating ? "created" : "updated", user.getLogin(), email);
    }

    private Authority findOrCreateAuthority(String name) {
        return authorityRepository
            .findById(name)
            .orElseGet(() -> {
                Authority authority = new Authority();
                authority.setName(name);
                return authorityRepository.save(authority);
            });
    }

    /** A bcrypt hash is a 60-char string prefixed with the $2a$/$2b$/$2y$ version tag. */
    static boolean isBcryptHash(String hash) {
        return hash != null && hash.length() == 60 && (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$"));
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }
}
