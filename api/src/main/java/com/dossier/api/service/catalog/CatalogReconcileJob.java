package com.dossier.api.service.catalog;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Nightly: compares Stripe's Prices with the catalog ({@link CatalogReconciler}) and records the differences as drift rows. Idle when billing is disabled.
 * Never writes money; a failed run is logged and tried again the next night.
 */
@Component
public class CatalogReconcileJob {

    private static final Logger LOG = LoggerFactory.getLogger(CatalogReconcileJob.class);

    private final CatalogReconciler reconciler;

    public CatalogReconcileJob(CatalogReconciler reconciler) {
        this.reconciler = reconciler;
    }

    @Scheduled(cron = "0 20 3 * * *")
    public void run() {
        try {
            CatalogReconciler.Result r = reconciler.run();
            if (r.ran()) LOG.info("catalog reconcile: {} stripe price(s) checked, {} drift opened, {} resolved, {} open", r.checked(), r.opened(), r.resolved(), r.open());
        } catch (RuntimeException e) {
            LOG.warn("catalog reconcile run failed: {}", e.toString());
        }
    }
}
