package com.dossier.api.web.rest;

import com.dossier.api.service.BugReportService;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public bug-report intake (Phase 9.A5). Auth is optional — a logged-in caller's login is filled
 * server-side from the bearer; anonymous reports are allowed. Reached via the rate-limiting BFF
 * (web) and directly from the extension. Diagnostic fields are only present when the reporter
 * consented (the client omits them otherwise).
 */
@RestController
@RequestMapping("/api/bug-reports")
public class BugReportResource {

    private static final Logger LOG = LoggerFactory.getLogger(BugReportResource.class);

    private final BugReportService service;

    public BugReportResource(BugReportService service) {
        this.service = service;
    }

    public record SubmitRequest(String source, String message, String category, String email, String url, String appVersion, String userAgent) {}

    @PostMapping
    public ResponseEntity<Map<String, Boolean>> submit(@RequestBody SubmitRequest req) {
        LOG.debug("REST request to submit a bug report (source={})", req == null ? null : req.source());
        if (req == null) {
            return ResponseEntity.badRequest().body(Map.of("ok", false));
        }
        service.submit(req.source(), req.message(), req.category(), req.email(), req.url(), req.appVersion(), req.userAgent());
        return ResponseEntity.accepted().body(Map.of("ok", true));
    }
}
