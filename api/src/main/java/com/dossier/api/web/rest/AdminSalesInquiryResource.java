package com.dossier.api.web.rest;

import com.dossier.api.domain.enumeration.InquiryStatus;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.SalesInquiryService;
import com.dossier.api.service.dto.SalesInquiryDTO;
import java.util.LinkedHashMap;
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

/** Admin "Contact us" queue (Phase 15.6): paginated list (status filter), counts, follow-up update. ADMIN-gated. */
@RestController
@RequestMapping("/api/admin/inquiries")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminSalesInquiryResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminSalesInquiryResource.class);

    private final SalesInquiryService service;

    public AdminSalesInquiryResource(SalesInquiryService service) {
        this.service = service;
    }

    public record UpdateRequest(String status, String adminNotes) {}

    private static InquiryStatus parseStatus(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return InquiryStatus.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @GetMapping
    public ResponseEntity<List<SalesInquiryDTO>> list(
        @RequestParam(name = "status", required = false) String status,
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        Page<SalesInquiryDTO> page = service.findAll(parseStatus(status), pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return new ResponseEntity<>(page.getContent(), headers, HttpStatus.OK);
    }

    @GetMapping("/counts")
    public Map<String, Long> counts() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (InquiryStatus s : InquiryStatus.values()) {
            counts.put(s.name(), service.count(s));
        }
        return counts;
    }

    @PutMapping("/{id}")
    public SalesInquiryDTO update(@PathVariable("id") Long id, @RequestBody UpdateRequest req) {
        LOG.debug("REST request to update sales inquiry {}", id);
        InquiryStatus status = req == null ? null : parseStatus(req.status());
        if (status == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid status is required.");
        }
        return service.update(id, status, req.adminNotes());
    }
}
