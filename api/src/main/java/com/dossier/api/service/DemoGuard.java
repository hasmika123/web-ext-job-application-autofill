package com.dossier.api.service;

import com.dossier.api.security.SecurityUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The demo accounts' write policy (phase demo): a scoped sandbox.
 *
 * <p>A demo account is shared by everyone who clicks "try the demo". Two kinds of endpoint:
 *
 * <ul>
 *   <li><b>Sandbox surfaces</b> (the Resume Builder and profile: ResumeDoc/Meta/File/Access/Ai,
 *       ProfileItem, Profile, Onboarding, application attachments, {@code /api/ai/draft}, and the
 *       board) do NOT call this guard at all, so a visitor can play with them. The shared data is put
 *       back to the seed by {@code DemoAccountService.resetData()} (nightly, {@code dossier.demo.reset-cron}),
 *       and AI is capped per day by {@link DemoAiCap}.</li>
 *   <li><b>Shared-account, security and money surfaces</b> (account, account deletion/export, billing,
 *       inbox, notification preferences, organizations, resume parsing) call {@link #assertNotDemo()}
 *       first. For a real user it does nothing; for a demo account it throws
 *       {@link DemoException#readOnly()}, which {@code ExceptionTranslator} turns into a 403
 *       {@code DEMO_READ_ONLY} problem the web app shows as a notice.</li>
 * </ul>
 *
 * <p>{@code dossier.demo.allow-writes} (env {@code DEMO_ALLOW_WRITES}, default false) is a global dev
 * override that lifts the block on the second group too. Never enable it in production.
 */
@Component
public class DemoGuard {

    private final DemoAccountService demoAccounts;
    private final boolean allowWrites;

    public DemoGuard(DemoAccountService demoAccounts, @Value("${dossier.demo.allow-writes:false}") boolean allowWrites) {
        this.demoAccounts = demoAccounts;
        this.allowWrites = allowWrites;
    }

    /** Throw {@code DEMO_READ_ONLY} when the signed-in user is a demo account (unless the dev override is on). */
    public void assertNotDemo() {
        if (allowWrites) {
            return;
        }
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
