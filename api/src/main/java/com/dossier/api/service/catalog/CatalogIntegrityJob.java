package com.dossier.api.service.catalog;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Nightly: re-hashes the snapshot of every published plan version ({@link CatalogIntegrityService}) and records drift when one changed. Never repairs. */
@Component
public class CatalogIntegrityJob {

    private static final Logger LOG = LoggerFactory.getLogger(CatalogIntegrityJob.class);

    private final CatalogIntegrityService integrity;

    public CatalogIntegrityJob(CatalogIntegrityService integrity) {
        this.integrity = integrity;
    }

    @Scheduled(cron = "0 40 3 * * *")
    public void run() {
        try {
            CatalogIntegrityService.Result r = integrity.run();
            if (r.mismatched() > 0) LOG.warn("catalog integrity: {} of {} published plan snapshot(s) no longer match their hash", r.mismatched(), r.checked());
        } catch (RuntimeException e) {
            LOG.warn("catalog integrity run failed: {}", e.toString());
        }
    }
}
