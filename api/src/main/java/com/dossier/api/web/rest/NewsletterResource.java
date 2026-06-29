package com.dossier.api.web.rest;

import com.dossier.api.service.NewsletterService;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public newsletter endpoints (Phase 9.A4): subscribe (double opt-in), confirm, unsubscribe.
 * No auth (permitAll in SecurityConfiguration); reached via the Next BFF, which rate-limits.
 * Subscribe is intentionally generic (always 202) so it can't be used to enumerate subscribers.
 */
@RestController
@RequestMapping("/api/newsletter")
public class NewsletterResource {

    private static final Logger LOG = LoggerFactory.getLogger(NewsletterResource.class);

    private final NewsletterService newsletterService;

    public NewsletterResource(NewsletterService newsletterService) {
        this.newsletterService = newsletterService;
    }

    public record SubscribeRequest(String email, String source) {}

    public record TokenRequest(String token) {}

    @PostMapping("/subscribe")
    public ResponseEntity<Map<String, Boolean>> subscribe(@RequestBody SubscribeRequest req) {
        LOG.debug("REST request to subscribe to the newsletter");
        newsletterService.subscribe(req == null ? null : req.email(), req == null ? null : req.source());
        // Generic — never reveal whether the address was new/existing/confirmed.
        return ResponseEntity.accepted().body(Map.of("ok", true));
    }

    @PostMapping("/confirm")
    public ResponseEntity<Map<String, Boolean>> confirm(@RequestBody TokenRequest req) {
        boolean confirmed = newsletterService.confirm(req == null ? null : req.token());
        return ResponseEntity.status(confirmed ? HttpStatus.OK : HttpStatus.BAD_REQUEST).body(Map.of("confirmed", confirmed));
    }

    @PostMapping("/unsubscribe")
    public ResponseEntity<Map<String, Boolean>> unsubscribe(@RequestBody TokenRequest req) {
        boolean unsubscribed = newsletterService.unsubscribe(req == null ? null : req.token());
        return ResponseEntity.status(unsubscribed ? HttpStatus.OK : HttpStatus.BAD_REQUEST).body(Map.of("unsubscribed", unsubscribed));
    }
}
