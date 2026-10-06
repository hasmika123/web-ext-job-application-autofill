package com.dossier.api.web.rest;

import com.dossier.api.config.Constants;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.AdminAiQuotaService;
import com.dossier.api.service.ai.AiPolicy;
import jakarta.validation.constraints.Pattern;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 * Per-user AI override management (Phase 9.A2.2). ADMIN-gated; set/clear are audited in the
 * service. Since 13.1b the override is a monthly budget in US cents: GET returns the Pro default
 * ({@code defaultBudgetCents}) plus this user's override (null = uses their plan). The path keeps
 * its old name so bookmarks and the audit trail still line up.
 */
@RestController
@RequestMapping("/api/admin/users/{login}/ai-quota")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminAiQuotaResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminAiQuotaResource.class);

    private final AdminAiQuotaService service;
    private final AiPolicy policy;

    public AdminAiQuotaResource(AdminAiQuotaService service, AiPolicy policy) {
        this.service = service;
        this.policy = policy;
    }

    public record BudgetRequest(Integer budgetCents) {}

    private int defaultBudgetCents() {
        return (int) Math.round(policy.getProMonthlyBudgetUsd() * 100);
    }

    @GetMapping
    public Map<String, Object> get(@PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login) {
        Map<String, Object> body = new HashMap<>();
        body.put("defaultBudgetCents", defaultBudgetCents());
        body.put("overrideCents", service.getOverride(login).orElse(null));
        return body;
    }

    @PutMapping
    public Map<String, Object> set(
        @PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login,
        @RequestBody BudgetRequest req
    ) {
        if (req == null || req.budgetCents() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing 'budgetCents'.");
        }
        LOG.debug("REST request to set AI budget override for {} = {}c", login, req.budgetCents());
        int set = service.setOverride(login, req.budgetCents());
        Map<String, Object> body = new HashMap<>();
        body.put("defaultBudgetCents", defaultBudgetCents());
        body.put("overrideCents", set);
        return body;
    }

    @DeleteMapping
    public ResponseEntity<Void> clear(@PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login) {
        LOG.debug("REST request to clear AI quota override for {}", login);
        service.clearOverride(login);
        return ResponseEntity.noContent().build();
    }
}
