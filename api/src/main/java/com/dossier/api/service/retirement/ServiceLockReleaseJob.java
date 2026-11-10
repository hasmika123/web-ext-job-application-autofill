package com.dossier.api.service.retirement;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Hourly housekeeping of the read-only locks (docs/subscriptions/11 section 7.2; story K10.5): closes the lock rows of accounts that hold the service again (an upgrade, an
 * add-on). This is tidiness and history only. Unlocking itself is instant and does not wait for this job: the gates ask whether the feature is held first and consult a lock row
 * only for a feature that is not.
 */
@Component
public class ServiceLockReleaseJob {

    private static final Logger LOG = LoggerFactory.getLogger(ServiceLockReleaseJob.class);

    private final ServiceLockService locks;

    public ServiceLockReleaseJob(ServiceLockService locks) {
        this.locks = locks;
    }

    @Scheduled(fixedDelay = 3_600_000L, initialDelay = 1_200_000L)
    public void run() {
        try {
            int n = locks.reconcileAll();
            if (n > 0) LOG.info("service locks: {} closed (the feature is held again)", n);
        } catch (RuntimeException e) {
            LOG.warn("service lock housekeeping failed: {}", e.toString());
        }
    }
}
