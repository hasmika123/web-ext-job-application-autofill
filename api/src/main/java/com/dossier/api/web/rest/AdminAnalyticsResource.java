package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.AdminAnalyticsService;
import com.dossier.api.service.AdminAnalyticsService.AnalyticsOverview;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Business-analytics overview for the admin console (Phase 9.A3). Read-only DB aggregates;
 * ADMIN-gated. Nothing here is mutated, so no audit entry is written.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminAnalyticsResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminAnalyticsResource.class);

    private final AdminAnalyticsService service;

    public AdminAnalyticsResource(AdminAnalyticsService service) {
        this.service = service;
    }

    @GetMapping("/analytics")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    public AnalyticsOverview overview() {
        LOG.debug("REST request for admin analytics overview");
        return service.overview();
    }
}
