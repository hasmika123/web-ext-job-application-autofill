package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.DemoAccountService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin control of the demo accounts (phase demo): a read-only status and a data reset. The on/off
 * switch is server config only ({@code DEMO_ENABLED}); there is deliberately no endpoint to flip it.
 * ADMIN-gated by {@code /api/admin/**} plus a method-level guard; a reset is written to the admin
 * audit trail (visible on {@code /admin/audit}).
 */
@RestController
@RequestMapping("/api/admin/settings/demo")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminDemoResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminDemoResource.class);

    private final DemoAccountService demoAccountService;
    private final AdminAuditService auditService;

    public AdminDemoResource(DemoAccountService demoAccountService, AdminAuditService auditService) {
        this.demoAccountService = demoAccountService;
        this.auditService = auditService;
    }

    @GetMapping
    public Map<String, Object> get() {
        return view();
    }

    @PostMapping("/reset")
    public Map<String, Object> reset() {
        LOG.debug("REST request to reset the demo data");
        demoAccountService.resetData();
        auditService.record(AdminAuditService.DEMO_RESET, AdminAuditService.TARGET_DEMO, "demo.data");
        return view();
    }

    private Map<String, Object> view() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("enabled", demoAccountService.isEnabled());
        body.put("accounts", demoAccountService.accounts());
        return body;
    }
}
