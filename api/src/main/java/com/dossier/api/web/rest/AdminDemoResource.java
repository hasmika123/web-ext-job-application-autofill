package com.dossier.api.web.rest;

import com.dossier.api.domain.AppSetting;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.DemoAccountService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Admin control of the demo accounts (phase demo): the on/off switch and a data reset. ADMIN-gated
 * by {@code /api/admin/**} plus a method-level guard; every change is written to the admin audit
 * trail (visible on {@code /admin/audit}).
 */
@RestController
@RequestMapping("/api/admin/settings/demo")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminDemoResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminDemoResource.class);

    public record EnabledRequest(Boolean enabled) {}

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

    @PutMapping
    public Map<String, Object> set(@RequestBody EnabledRequest req) {
        if (req == null || req.enabled() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing 'enabled'.");
        }
        String by = SecurityUtils.getCurrentUserLogin().orElse("system");
        LOG.debug("REST request to set demo accounts enabled={}", req.enabled());
        demoAccountService.setEnabled(req.enabled(), by);
        auditService.record(
            req.enabled() ? AdminAuditService.DEMO_ENABLE : AdminAuditService.DEMO_DISABLE,
            AdminAuditService.TARGET_DEMO,
            DemoAccountService.SETTING_ENABLED
        );
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
        AppSetting row = demoAccountService.settingRow().orElse(null);
        body.put("updatedBy", row == null ? null : row.getUpdatedBy());
        body.put("updatedDate", row == null ? null : row.getUpdatedDate());
        return body;
    }
}
