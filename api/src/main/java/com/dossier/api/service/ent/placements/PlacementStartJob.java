package com.dossier.api.service.ent.placements;

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
 * Daily: a PENDING_START placement whose start day has come becomes ACTIVE (a placement event and an audit row record it, and the consultant's
 * availability moves to On a project). One organization at a time inside {@link TenantScoped}; one organization's failure never stops the others;
 * re-running is a no-op because a started placement no longer matches.
 */
@Component
public class PlacementStartJob {

    private static final Logger LOG = LoggerFactory.getLogger(PlacementStartJob.class);

    private final OrganizationRepository organizations;
    private final PlacementHireService hire;

    public PlacementStartJob(OrganizationRepository organizations, PlacementHireService hire) {
        this.organizations = organizations;
        this.hire = hire;
    }

    @Scheduled(cron = "${dossier.enterprise.placement-start-cron:0 10 0 * * *}", zone = "UTC")
    public void scheduled() {
        try {
            int total = runOnce().values().stream().mapToInt(Integer::intValue).sum();
            if (total > 0) LOG.info("Started {} placement(s) on their start date", total);
        } catch (RuntimeException e) {
            LOG.warn("Placement start run failed", e); // the next day retries
        }
    }

    /** One pass over every organization; returns the organizations that started something and how many. */
    public Map<Long, Integer> runOnce() {
        List<Long> orgIds = new ArrayList<>();
        TenantScoped.unscoped(() -> orgIds.addAll(organizations.findAllOrgIds()));
        Map<Long, Integer> out = new LinkedHashMap<>();
        for (Long orgId : orgIds) {
            try {
                int n = TenantScoped.get(orgId, () -> hire.startDue(orgId));
                if (n > 0) out.put(orgId, n);
            } catch (RuntimeException e) {
                LOG.warn("Placement start failed for org {}", orgId, e);
            }
        }
        return out;
    }
}
