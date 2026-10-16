package com.dossier.api.service.billing.reconcile;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Nightly (03:50): runs the {@link PersonalBillingReconciler}. Idle when billing is disabled. Never writes money; a failed run is logged and tried again the
 * next night. One instance runs it (the deployment is one API container); a multi-instance deployment needs a lock around it (ShedLock) first.
 */
@Component
public class PersonalBillingReconcileJob {

    private static final Logger LOG = LoggerFactory.getLogger(PersonalBillingReconcileJob.class);

    private final PersonalBillingReconciler reconciler;

    public PersonalBillingReconcileJob(PersonalBillingReconciler reconciler) {
        this.reconciler = reconciler;
    }

    @Scheduled(cron = "0 50 3 * * *")
    public void run() {
        try {
            PersonalBillingReconciler.Result r = reconciler.run();
            if (r.ran()) {
                LOG.info(
                    "personal billing reconcile: {} subscription(s) checked, {} unreadable, {} drift opened, {} resolved, {} open",
                    r.checked(),
                    r.failed(),
                    r.opened(),
                    r.resolved(),
                    r.open()
                );
            }
        } catch (RuntimeException e) {
            LOG.warn("personal billing reconcile run failed: {}", e.toString());
        }
    }
}
