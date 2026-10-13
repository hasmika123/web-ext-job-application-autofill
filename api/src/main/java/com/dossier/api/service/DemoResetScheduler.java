package com.dossier.api.service;

import java.time.ZoneOffset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Component;

/**
 * Puts the shared demo accounts back to the seed on a schedule, so one visitor's sandbox changes do
 * not live forever. {@code dossier.demo.reset-cron} (env {@code DEMO_RESET_CRON}, UTC, default nightly
 * {@code 0 0 4 * * *}); blank turns it off. Runs only while the demo is enabled. It calls the same
 * {@link DemoAccountService#resetData()} as the admin's reset button, which only ever touches the
 * demo accounts' own ids.
 */
@Component
public class DemoResetScheduler implements SchedulingConfigurer {

    private static final Logger LOG = LoggerFactory.getLogger(DemoResetScheduler.class);

    private final DemoAccountService demoAccounts;
    private final String cron;

    public DemoResetScheduler(DemoAccountService demoAccounts, @Value("${dossier.demo.reset-cron:0 0 4 * * *}") String cron) {
        this.demoAccounts = demoAccounts;
        this.cron = cron == null ? "" : cron.trim();
    }

    /** True when a schedule is configured (a blank value, or "-", means off). */
    boolean scheduled() {
        return !cron.isEmpty() && !"-".equals(cron);
    }

    @Override
    public void configureTasks(ScheduledTaskRegistrar registrar) {
        if (!scheduled()) {
            return;
        }
        registrar.addTriggerTask(this::runReset, new CronTrigger(cron, ZoneOffset.UTC));
    }

    /** One scheduled reset; a failure is logged and never propagates into the scheduler thread. */
    void runReset() {
        if (!demoAccounts.isEnabled()) {
            return;
        }
        try {
            demoAccounts.resetData();
            LOG.info("Scheduled demo reset done");
        } catch (RuntimeException e) {
            LOG.error("Scheduled demo reset failed", e);
        }
    }
}
