package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.dto.AdminAuditEventDTO;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.PaginationUtil;

/**
 * Read-only admin audit log (Phase 9.A1). The trail is append-only and exposed here for
 * the admin console; it is never mutated over HTTP. ADMIN-gated by {@code /api/admin/**}
 * (SecurityConfiguration) plus a method-level guard for defence in depth.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminAuditResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminAuditResource.class);

    private final AdminAuditService adminAuditService;

    public AdminAuditResource(AdminAuditService adminAuditService) {
        this.adminAuditService = adminAuditService;
    }

    /**
     * {@code GET /admin/audit} : paginated audit events. Pass {@code ?actor=} to filter by the
     * acting admin's login; sort with the standard {@code ?sort=createdDate,desc}.
     */
    @GetMapping("/audit")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    public ResponseEntity<List<AdminAuditEventDTO>> getAuditEvents(
        @RequestParam(name = "actor", required = false) String actor,
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        LOG.debug("REST request to get a page of admin audit events (actor filter='{}')", actor);
        Page<AdminAuditEventDTO> page = adminAuditService.findAll(actor, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return new ResponseEntity<>(page.getContent(), headers, HttpStatus.OK);
    }
}
