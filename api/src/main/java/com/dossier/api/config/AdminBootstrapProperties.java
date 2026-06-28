package com.dossier.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Env-driven bootstrap for the real production admin (Phase 9.A0 security gate).
 *
 * The default {@code admin}/{@code admin} seed (JHipster's publicly known bcrypt hash) is no
 * longer loaded in production — see the Liquibase changesets {@code 20260628000000_seed_dev_
 * default_users} (gated to dev/test) and {@code 20260628000100_remove_default_admin_seed} (prod
 * cleanup). The real admin is created/promoted at startup by {@link AdminBootstrap} from these
 * values, so <strong>no password or hash is ever committed</strong>.
 *
 * Bound under {@code dossier.admin.*} (NOT {@code application.*} — JHipster owns that prefix with
 * {@code ignoreUnknownFields=false}). In prod these come from the {@code ADMIN_EMAIL} /
 * {@code ADMIN_PASSWORD_HASH} / {@code ADMIN_LOGIN} env vars (see application-prod.yml).
 *
 * {@code passwordHash} is a bcrypt hash (e.g. {@code htpasswd -bnBC 10 "" 'yourpassword' | tr -d ':\n'}),
 * never a plaintext password — it lives in the server env only.
 */
@ConfigurationProperties(prefix = "dossier.admin")
public class AdminBootstrapProperties {

    /** Admin email/identity. Blank ⇒ bootstrap is skipped. */
    private String email = "";

    /** Bcrypt hash of the admin password ($2a/$2b/$2y$, 60 chars). Blank ⇒ bootstrap is skipped. */
    private String passwordHash = "";

    /** Login for the admin account (lowercased). Defaults to "admin". */
    private String login = "admin";

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getLogin() {
        return login;
    }

    public void setLogin(String login) {
        this.login = login;
    }
}
