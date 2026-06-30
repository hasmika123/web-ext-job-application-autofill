package com.dossier.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Syncs newsletter consent to a Brevo contact list (Phase 9.A4.4). Our {@code email_subscriber}
 * table stays the source of truth; this mirrors the outcome to Brevo so campaigns can be sent from
 * there. OFF unless {@code dossier.brevo.api-key} + {@code dossier.brevo.list-id} are configured
 * (env only — the key is never bundled). All calls are best-effort: a Brevo failure must never break
 * the user's subscribe/unsubscribe flow (the local row is authoritative; a later CSV export or
 * re-sync can reconcile).
 */
@Service
public class BrevoContactService {

    private static final Logger LOG = LoggerFactory.getLogger(BrevoContactService.class);
    private static final String BASE = "https://api.brevo.com/v3";

    private final String apiKey;
    private final long listId;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final ObjectMapper om = new ObjectMapper();

    public BrevoContactService(
        @Value("${dossier.brevo.api-key:}") String apiKey,
        @Value("${dossier.brevo.list-id:0}") long listId
    ) {
        this.apiKey = apiKey;
        this.listId = listId;
    }

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank() && listId > 0;
    }

    /** Add (or update) a confirmed subscriber to the configured Brevo list. Best-effort. */
    public void addConfirmedContact(String email) {
        if (!isConfigured() || email == null || email.isBlank()) {
            return;
        }
        send(
            "POST",
            "/contacts",
            Map.of("email", email, "listIds", List.of(listId), "updateEnabled", true),
            "add contact"
        );
    }

    /** Mark a contact as opted-out (blacklisted) in Brevo on unsubscribe. Best-effort. */
    public void removeContact(String email) {
        if (!isConfigured() || email == null || email.isBlank()) {
            return;
        }
        String path = "/contacts/" + URLEncoder.encode(email, StandardCharsets.UTF_8);
        send("PUT", path, Map.of("emailBlacklisted", true), "blacklist contact");
    }

    private void send(String method, String path, Map<String, Object> body, String what) {
        try {
            String json = om.writeValueAsString(body);
            HttpRequest req = HttpRequest.newBuilder(URI.create(BASE + path))
                .timeout(Duration.ofSeconds(10))
                .header("api-key", apiKey)
                .header("content-type", "application/json")
                .header("accept", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(json))
                .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 300) {
                LOG.warn("Brevo {} failed (HTTP {}): {}", what, res.statusCode(), res.body());
            } else {
                LOG.debug("Brevo {} ok (HTTP {})", what, res.statusCode());
            }
        } catch (Exception e) {
            // Best-effort — the local subscriber row is the source of truth.
            LOG.warn("Brevo {} errored: {}", what, e.getMessage());
        }
    }
}
