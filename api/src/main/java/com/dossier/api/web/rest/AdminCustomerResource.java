package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.CustomerAdminService;
import com.dossier.api.service.dto.CustomerDTOs.Customer;
import com.dossier.api.service.dto.CustomerDTOs.Detail;
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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.PaginationUtil;

/**
 * Admin Customers page + each customer's billing timeline and notes (Phase 9.C1). ADMIN-gated.
 * Read-only over the billing mirror; the only write is a note, which is audited.
 */
@RestController
@RequestMapping("/api/admin/customers")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminCustomerResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminCustomerResource.class);

    private final CustomerAdminService service;

    public AdminCustomerResource(CustomerAdminService service) {
        this.service = service;
    }

    public record NoteRequest(String body) {}

    /** {@code filter}: ACTIVE, PAST_DUE, CANCELLING, LAPSED, NEW — or blank for everyone. */
    @GetMapping
    public ResponseEntity<List<Customer>> list(
        @RequestParam(name = "filter", required = false) String filter,
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        Page<Customer> page = service.list(filter, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return new ResponseEntity<>(page.getContent(), headers, HttpStatus.OK);
    }

    @GetMapping("/counts")
    public Map<String, Long> counts() {
        return service.counts();
    }

    @GetMapping("/{login}")
    public Detail detail(@PathVariable("login") String login) {
        return service.detail(login);
    }

    @PostMapping("/{login}/notes")
    public ResponseEntity<Map<String, Boolean>> addNote(@PathVariable("login") String login, @RequestBody NoteRequest req) {
        LOG.debug("REST request to add a customer note for {}", login);
        service.addNote(login, req == null ? null : req.body());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("ok", true));
    }
}
