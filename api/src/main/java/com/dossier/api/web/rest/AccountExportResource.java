package com.dossier.api.web.rest;

import com.dossier.api.service.AccountExportService;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Self-service DSAR export (Phase 9.X.2): the current user downloads a JSON copy of their data.
 * Authenticated (covered by the `/api/**` rule) and inherently user-scoped — there is no id/login
 * parameter, so a user can only ever export their own data.
 */
@RestController
@RequestMapping("/api/account")
public class AccountExportResource {

    private static final Logger LOG = LoggerFactory.getLogger(AccountExportResource.class);

    private final AccountExportService exportService;

    public AccountExportResource(AccountExportService exportService) {
        this.exportService = exportService;
    }

    @GetMapping("/export")
    public Map<String, Object> export() {
        LOG.debug("REST request to export the current user's data");
        return exportService.exportCurrentUser();
    }
}
