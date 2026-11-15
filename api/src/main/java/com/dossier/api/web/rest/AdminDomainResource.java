package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ent.domains.AdminDomainService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Platform admin: every organization's addresses (CUSTOM-DOMAINS-BUILD.md A4b; 10-domain-routing.md s7). {@code ROLE_ADMIN} only. The ones that need
 * attention come first (suspended, failing DNS, certificate failed). Re-check runs the DNS check and the certificate probe now. Suspend and resume stay on
 * the organization's page ({@code /api/admin/orgs/{id}/hostnames/{hid}/suspend|resume}).
 */
@RestController
@RequestMapping("/api/admin/domains")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminDomainResource {

    private final AdminDomainService domains;

    public AdminDomainResource(AdminDomainService domains) {
        this.domains = domains;
    }

    @GetMapping
    public AdminDomainService.Page list(
        @RequestParam(name = "status", required = false) String status,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "page", defaultValue = "0") int page
    ) {
        return domains.list(status, q, page);
    }

    @PostMapping("/{id}/recheck")
    public AdminDomainService.Rechecked recheck(@PathVariable("id") Long id) {
        return domains.recheck(id);
    }
}
