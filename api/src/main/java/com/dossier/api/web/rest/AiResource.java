package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.AiDraftService;
import com.dossier.api.web.rest.vm.AiDraftVM;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * The metered server-side AI proxy (Phase 5.1). The extension's BYO-key path still
 * calls the LLM directly; this is the alternative for users who opt into Dossier's
 * managed AI on the server's key (free monthly quota, key never leaves the server).
 */
@RestController
@RequestMapping("/api/ai")
@Tag(name = "ai", description = "Server-side metered AI answer drafting (opt-in).")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class AiResource {

    private static final Logger LOG = LoggerFactory.getLogger(AiResource.class);

    private final AiDraftService aiDraftService;

    public AiResource(AiDraftService aiDraftService) {
        this.aiDraftService = aiDraftService;
    }

    /**
     * {@code POST /api/ai/draft} : draft an answer to an open-ended question, grounded
     * in the supplied background. Returns one of: {@code {answer,used,quota}},
     * {@code {disabled:true}}, {@code {consentRequired:true}}, {@code {quotaExceeded:true,...}},
     * or HTTP 502 {@code {error}}.
     */
    @Operation(summary = "Draft an answer", description = "Metered, opt-in server-side AI drafting for the current user.")
    @PostMapping("/draft")
    public ResponseEntity<Map<String, Object>> draft(@Valid @RequestBody AiDraftVM vm) {
        AiDraftService.Result r = aiDraftService.draft(vm.getQuestion(), vm.getContext(), vm.isConsent());
        Map<String, Object> body = new HashMap<>();
        switch (r.status()) {
            case OK -> {
                body.put("answer", r.answer());
                body.put("used", r.used());
                body.put("quota", r.quota());
                body.put("cached", r.cached()); // served from the server-side answer cache (Phase 5.3)
                return ResponseEntity.ok(body);
            }
            case DISABLED -> {
                body.put("disabled", true);
                return ResponseEntity.ok(body);
            }
            case CONSENT_REQUIRED -> {
                body.put("consentRequired", true);
                return ResponseEntity.ok(body);
            }
            case QUOTA_EXCEEDED -> {
                body.put("quotaExceeded", true);
                body.put("used", r.used());
                body.put("quota", r.quota());
                return ResponseEntity.ok(body);
            }
            default -> {
                body.put("error", "The AI provider could not draft an answer right now.");
                return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(body);
            }
        }
    }
}
