package com.dossier.api.config;

import com.dossier.api.service.DemoAccountService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Creates the two demo users at startup (phase demo), after Liquibase, like {@link AdminBootstrap}.
 *
 * <p>Creating the accounts does not turn the demo on: {@code dossier.demo.enabled} (env
 * {@code DEMO_ENABLED}, default {@code false}) does that. When it is off at startup, any existing
 * demo refresh tokens are revoked, so flipping it off and restarting signs demo sessions out. Defensive by design: a failure is logged, never fatal, so a demo
 * problem cannot stop the API serving real users. {@code dossier.demo.create-accounts} (env
 * {@code DEMO_CREATE_ACCOUNTS}) switches the startup step off entirely; the test profile does, so
 * the integration suite's user tables stay clean.
 */
@Component
public class DemoAccountBootstrap implements ApplicationRunner {

    private static final Logger LOG = LoggerFactory.getLogger(DemoAccountBootstrap.class);

    private final DemoAccountService demoAccountService;
    private final boolean createAccounts;

    public DemoAccountBootstrap(
        DemoAccountService demoAccountService,
        @Value("${dossier.demo.create-accounts:true}") boolean createAccounts
    ) {
        this.demoAccountService = demoAccountService;
        this.createAccounts = createAccounts;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            if (createAccounts) {
                if (demoAccountService.isEnabled()) {
                    demoAccountService.ensureSeeded();
                } else {
                    demoAccountService.ensureAccounts();
                }
            } else {
                LOG.info("Demo account creation skipped (dossier.demo.create-accounts=false).");
            }
            if (!demoAccountService.isEnabled()) {
                demoAccountService.revokeSessions();
                LOG.info("Demo is disabled (dossier.demo.enabled=false); demo sessions revoked.");
            }
        } catch (RuntimeException e) {
            LOG.error("Demo account bootstrap failed; demo accounts were not created/updated.", e);
        }
    }
}
