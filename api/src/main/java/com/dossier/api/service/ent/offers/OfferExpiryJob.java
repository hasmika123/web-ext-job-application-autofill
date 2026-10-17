package com.dossier.api.service.ent.offers;

import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.TenantScoped;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Nightly: an offer still waiting on the consultant whose deadline day has passed becomes EXPIRED (an offer event by SYSTEM and an audit row each). The
 * deadline is the one entered, or the extend day plus the admin-configured {@code org.offers.expiry_days}. One organization at a time inside
 * {@link TenantScoped}; one organization's failure never stops the others; re-running is a no-op.
 */
@Component
public class OfferExpiryJob {

    private static final Logger LOG = LoggerFactory.getLogger(OfferExpiryJob.class);

    private final OrganizationRepository organizations;
    private final OfferCommandService commands;

    public OfferExpiryJob(OrganizationRepository organizations, OfferCommandService commands) {
        this.organizations = organizations;
        this.commands = commands;
    }

    @Scheduled(cron = "${dossier.enterprise.offer-expiry-cron:0 15 0 * * *}", zone = "UTC")
    public void scheduled() {
        try {
            int total = runOnce().values().stream().mapToInt(Integer::intValue).sum();
            if (total > 0) LOG.info("Expired {} offer(s) past their deadline", total);
        } catch (RuntimeException e) {
            LOG.warn("Offer expiry run failed", e); // the next night retries
        }
    }

    /** One pass over every organization; returns the organizations that expired something and how many. */
    public Map<Long, Integer> runOnce() {
        List<Long> orgIds = new ArrayList<>();
        TenantScoped.unscoped(() -> orgIds.addAll(organizations.findAllOrgIds()));
        Map<Long, Integer> out = new LinkedHashMap<>();
        for (Long orgId : orgIds) {
            try {
                int n = TenantScoped.get(orgId, () -> commands.expireDue(orgId));
                if (n > 0) out.put(orgId, n);
            } catch (RuntimeException e) {
                LOG.warn("Offer expiry failed for org {}", orgId, e);
            }
        }
        return out;
    }
}
