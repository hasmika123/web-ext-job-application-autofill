package com.dossier.api.web.rest;

import com.dossier.api.domain.EmailSubscriber;
import com.dossier.api.domain.enumeration.SubscriberStatus;
import com.dossier.api.repository.EmailSubscriberRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.dto.AdminSubscriberDTO;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.PaginationUtil;

/**
 * Admin newsletter-subscriber management (Phase 9.A4.3): paginated list (optionally by status),
 * per-status counts, and a CSV export (for manual import into Brevo until API sync lands).
 * ADMIN-gated. Read-only — tokens are never exposed (see {@link AdminSubscriberDTO}).
 */
@RestController
@RequestMapping("/api/admin/subscribers")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminSubscriberResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminSubscriberResource.class);

    private final EmailSubscriberRepository repository;

    public AdminSubscriberResource(EmailSubscriberRepository repository) {
        this.repository = repository;
    }

    private static SubscriberStatus parseStatus(String status) {
        if (status == null || status.isBlank()) return null;
        try {
            return SubscriberStatus.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @GetMapping
    public ResponseEntity<List<AdminSubscriberDTO>> list(
        @RequestParam(name = "status", required = false) String status,
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        SubscriberStatus s = parseStatus(status);
        Page<EmailSubscriber> page = s == null ? repository.findAll(pageable) : repository.findAllByStatus(s, pageable);
        Page<AdminSubscriberDTO> dtos = page.map(AdminSubscriberDTO::new);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), dtos);
        return new ResponseEntity<>(dtos.getContent(), headers, HttpStatus.OK);
    }

    @GetMapping("/counts")
    public Map<String, Long> counts() {
        return Map.of(
            "PENDING",
            repository.countByStatus(SubscriberStatus.PENDING),
            "CONFIRMED",
            repository.countByStatus(SubscriberStatus.CONFIRMED),
            "UNSUBSCRIBED",
            repository.countByStatus(SubscriberStatus.UNSUBSCRIBED)
        );
    }

    @GetMapping("/export")
    public ResponseEntity<String> export(@RequestParam(name = "status", required = false) String status) {
        SubscriberStatus s = parseStatus(status);
        List<EmailSubscriber> rows = s == null
            ? repository.findAllByOrderByCreatedDateDesc()
            : repository.findByStatusOrderByCreatedDateDesc(s);
        LOG.debug("Exporting {} subscribers (status={})", rows.size(), s);

        StringBuilder csv = new StringBuilder("email,status,consent_source,consent_at,confirmed_at,unsubscribed_at,created_date\n");
        for (EmailSubscriber r : rows) {
            csv
                .append(csv(r.getEmail()))
                .append(',')
                .append(r.getStatus())
                .append(',')
                .append(csv(r.getConsentSource()))
                .append(',')
                .append(iso(r.getConsentAt()))
                .append(',')
                .append(iso(r.getConfirmedAt()))
                .append(',')
                .append(iso(r.getUnsubscribedAt()))
                .append(',')
                .append(iso(r.getCreatedDate()))
                .append('\n');
        }

        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("text/csv"))
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"subscribers.csv\"")
            .body(csv.toString());
    }

    private static String iso(Instant t) {
        return t == null ? "" : t.toString();
    }

    /** Minimal CSV-escape: wrap in quotes and double any internal quotes. */
    private static String csv(String v) {
        if (v == null) return "";
        return "\"" + v.replace("\"", "\"\"") + "\"";
    }
}
