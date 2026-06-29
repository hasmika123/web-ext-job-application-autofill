package com.dossier.api.web.rest;

import com.dossier.api.config.Constants;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.AdminAiQuotaService;
import jakarta.validation.constraints.Pattern;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Per-user AI quota override management (Phase 9.A2.2). ADMIN-gated; set/clear are audited in the
 * service. GET returns the global default plus this user's override (null = uses the default).
 */
@RestController
@RequestMapping("/api/admin/users/{login}/ai-quota")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminAiQuotaResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminAiQuotaResource.class);

    private final AdminAiQuotaService service;
    private final int defaultQuota;

    public AdminAiQuotaResource(AdminAiQuotaService service, @Value("${dossier.ai.free-monthly-quota:50}") int defaultQuota) {
        this.service = service;
        this.defaultQuota = defaultQuota;
    }

    public record QuotaRequest(Integer quota) {}

    @GetMapping
    public Map<String, Object> get(@PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login) {
        Map<String, Object> body = new HashMap<>();
        body.put("defaultQuota", defaultQuota);
        body.put("override", service.getOverride(login).orElse(null));
        return body;
    }

    @PutMapping
    public Map<String, Object> set(
        @PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login,
        @RequestBody QuotaRequest req
    ) {
        if (req == null || req.quota() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing 'quota'.");
        }
        LOG.debug("REST request to set AI quota override for {} = {}", login, req.quota());
        int set = service.setOverride(login, req.quota());
        Map<String, Object> body = new HashMap<>();
        body.put("defaultQuota", defaultQuota);
        body.put("override", set);
        return body;
    }

    @DeleteMapping
    public ResponseEntity<Void> clear(@PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login) {
        LOG.debug("REST request to clear AI quota override for {}", login);
        service.clearOverride(login);
        return ResponseEntity.noContent().build();
    }
}
