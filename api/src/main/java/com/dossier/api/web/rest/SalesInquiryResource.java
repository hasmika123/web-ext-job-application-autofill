package com.dossier.api.web.rest;

import com.dossier.api.service.SalesInquiryService;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public "Contact us" intake (Phase 15.6). Auth is optional — a signed-in caller's login is
 * filled server-side. Reached through the rate-limiting BFF (web `/api/inquiries`).
 */
@RestController
@RequestMapping("/api/inquiries")
public class SalesInquiryResource {

    private static final Logger LOG = LoggerFactory.getLogger(SalesInquiryResource.class);

    private final SalesInquiryService service;

    public SalesInquiryResource(SalesInquiryService service) {
        this.service = service;
    }

    public record SubmitRequest(String topic, String name, String email, String company, String teamSize, String message) {}

    @PostMapping
    public ResponseEntity<Map<String, Boolean>> submit(@RequestBody SubmitRequest req) {
        LOG.debug("REST request to submit a sales inquiry (topic={})", req == null ? null : req.topic());
        if (req == null) {
            return ResponseEntity.badRequest().body(Map.of("ok", false));
        }
        service.submit(req.topic(), req.name(), req.email(), req.company(), req.teamSize(), req.message());
        return ResponseEntity.accepted().body(Map.of("ok", true));
    }
}
