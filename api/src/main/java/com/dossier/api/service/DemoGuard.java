package com.dossier.api.service;

import com.dossier.api.security.SecurityUtils;
import org.springframework.stereotype.Component;

/**
 * The demo accounts' read-only rule (phase demo).
 *
 * <p>A demo account is shared by everyone who clicks "try the demo", so whatever one visitor saves
 * would be seen by the next. Endpoints that change the profile, credentials, resumes, billing or
 * inbox, or that delete or export the account, call {@link #assertNotDemo()} first. For a real user
 * it does nothing; for a demo account it throws {@link DemoException#readOnly()}, which
 * {@code ExceptionTranslator} turns into a 403 {@code DEMO_READ_ONLY} problem the web app shows as
 * a notice. The board itself (statuses, notes) is deliberately NOT guarded, so the demo feels live.
 */
@Component
public class DemoGuard {

    private final DemoAccountService demoAccounts;

    public DemoGuard(DemoAccountService demoAccounts) {
        this.demoAccounts = demoAccounts;
    }

    /** Throw {@code DEMO_READ_ONLY} when the signed-in user is a demo account. */
    public void assertNotDemo() {
        if (SecurityUtils.getCurrentUserLogin().map(demoAccounts::isDemo).orElse(false)) {
            throw DemoException.readOnly();
        }
    }

    /**
     * Throw {@code DEMO_DISABLED} when {@code loginOrEmail} names a demo account while the demo
     * switch is off. Used on the password sign-in path so a demo login can never get in through the
     * back door when the feature is off.
     */
    public void assertLoginAllowed(String loginOrEmail) {
        if (demoAccounts.isDemoIdentifier(loginOrEmail) && !demoAccounts.isEnabled()) {
            throw DemoException.disabled();
        }
    }
}
