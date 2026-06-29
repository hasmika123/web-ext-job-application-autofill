package com.dossier.api.web.rest;

import com.dossier.api.domain.enumeration.BugSeverity;
import com.dossier.api.domain.enumeration.BugStatus;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.BugReportService;
import com.dossier.api.service.dto.BugReportDTO;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.PaginationUtil;

/**
 * Admin bug-report triage (Phase 9.A5): paginated list (status filter), counts, detail, and a
 * status/severity/notes update (audited in the service). ADMIN-gated.
 */
@RestController
@RequestMapping("/api/admin/bug-reports")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminBugReportResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminBugReportResource.class);

    private final BugReportService service;

    public AdminBugReportResource(BugReportService service) {
        this.service = service;
    }

    public record TriageRequest(String status, String severity, String adminNotes) {}

    private static BugStatus parseStatus(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return BugStatus.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @GetMapping
    public ResponseEntity<List<BugReportDTO>> list(
        @RequestParam(name = "status", required = false) String status,
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        Page<BugReportDTO> page = service.findAll(parseStatus(status), pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return new ResponseEntity<>(page.getContent(), headers, HttpStatus.OK);
    }

    @GetMapping("/counts")
    public Map<String, Long> counts() {
        return Map.of(
            "NEW",
            service.count(BugStatus.NEW),
            "TRIAGED",
            service.count(BugStatus.TRIAGED),
            "IN_PROGRESS",
            service.count(BugStatus.IN_PROGRESS),
            "RESOLVED",
            service.count(BugStatus.RESOLVED),
            "WONTFIX",
            service.count(BugStatus.WONTFIX)
        );
    }

    @GetMapping("/{id}")
    public BugReportDTO get(@PathVariable("id") Long id) {
        return service.get(id);
    }

    @PutMapping("/{id}")
    public BugReportDTO update(@PathVariable("id") Long id, @RequestBody TriageRequest req) {
        LOG.debug("REST request to triage bug report {}", id);
        if (req == null || parseStatus(req.status()) == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid status is required.");
        }
        BugSeverity severity = null;
        if (req.severity() != null && !req.severity().isBlank()) {
            try {
                severity = BugSeverity.valueOf(req.severity().trim().toUpperCase());
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid severity.");
            }
        }
        return service.updateTriage(id, parseStatus(req.status()), severity, req.adminNotes());
    }
}
