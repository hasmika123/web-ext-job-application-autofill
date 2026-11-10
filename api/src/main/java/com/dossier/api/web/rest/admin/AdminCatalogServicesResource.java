package com.dossier.api.web.rest.admin;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.catalog.ServiceService;
import com.dossier.api.service.catalog.dto.RetireRequest;
import com.dossier.api.service.catalog.dto.ServiceDTO;
import com.dossier.api.service.catalog.dto.ServiceRequest;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Platform admin: the services of the catalog (docs/subscriptions/09-apis.md section 1; story K1.1). {@code ROLE_ADMIN} only; the finer
 * {@code catalog.manage} / {@code catalog.view} permissions arrive with the staff-role model (A0) and narrow this, never widen it. These are
 * platform routes, not organization-scoped ones. The key is immutable; a retirement is HIGH and carries a reason.
 */
@RestController
@RequestMapping("/api/admin/catalog/services")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminCatalogServicesResource {

    private final ServiceService services;

    public AdminCatalogServicesResource(ServiceService services) {
        this.services = services;
    }

    @GetMapping
    public List<ServiceDTO> list(
        @RequestParam(value = "audience", required = false) String audience,
        @RequestParam(value = "category", required = false) String category,
        @RequestParam(value = "active", required = false) Boolean active,
        @RequestParam(value = "q", required = false) String q
    ) {
        return services.list(audience, category, active, q);
    }

    @PostMapping
    public ResponseEntity<ServiceDTO> create(@RequestBody ServiceRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(services.create(body));
    }

    @PutMapping("/{key}")
    public ServiceDTO update(@PathVariable("key") String key, @RequestBody ServiceRequest body) {
        return services.update(key, body);
    }

    @PostMapping("/{key}/retire")
    public ServiceDTO retire(@PathVariable("key") String key, @RequestBody(required = false) RetireRequest body) {
        return services.retire(key, body == null ? null : body.reason());
    }
}
