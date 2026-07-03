package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.AiDraftService;
import com.dossier.api.service.AiResumeParseService;
import com.dossier.api.web.rest.vm.AiDraftVM;
import com.dossier.api.web.rest.vm.AiParseResumeVM;
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

    /** Extracted resume text cap (chars) — a resume is 1-3 pages; 60k is generous. */
    private static final int MAX_TEXT_CHARS = 60_000;
    /** Base64 file cap (chars) ≈ 5MB of PDF — matches the upload path's file cap ballpark. */
    private static final int MAX_FILE_BASE64_CHARS = 7_000_000;

    private final AiDraftService aiDraftService;
    private final AiResumeParseService aiResumeParseService;

    public AiResource(AiDraftService aiDraftService, AiResumeParseService aiResumeParseService) {
        this.aiDraftService = aiDraftService;
        this.aiResumeParseService = aiResumeParseService;
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

    /**
     * {@code POST /api/ai/parse-resume} : parse a resume (extracted text, or the
     * original PDF when extraction fails) into the canonical structured-resume JSON
     * via the configured AI provider. Same gating as {@code /draft}: enabled, consent,
     * monthly quota (one parse = one credit). Returns one of {@code {parsed,used,quota}},
     * {@code {disabled:true}}, {@code {consentRequired:true}}, {@code {quotaExceeded:true,...}},
     * or HTTP 502 {@code {error}}.
     */
    @Operation(summary = "Parse a resume", description = "Metered, opt-in server-side AI resume parsing for the current user.")
    @PostMapping("/parse-resume")
    public ResponseEntity<Map<String, Object>> parseResume(@Valid @RequestBody AiParseResumeVM vm) {
        boolean hasText = vm.getText() != null && !vm.getText().isBlank();
        boolean hasFile = vm.getFileBase64() != null && !vm.getFileBase64().isBlank();
        if (hasText == hasFile) { // neither, or both
            return ResponseEntity.badRequest().body(Map.of("error", "Provide either text or fileBase64 (not both)."));
        }
        if (hasText && vm.getText().length() > MAX_TEXT_CHARS) {
            return ResponseEntity.badRequest().body(Map.of("error", "Resume text is too long."));
        }
        if (hasFile) {
            if (vm.getFileBase64().length() > MAX_FILE_BASE64_CHARS) {
                return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(Map.of("error", "That file is too large (max ~5MB)."));
            }
            String mime = vm.getFileMimeType() == null ? "" : vm.getFileMimeType().trim().toLowerCase();
            if (!"application/pdf".equals(mime)) {
                return ResponseEntity.badRequest().body(Map.of("error", "Only PDF files can be parsed directly — send extracted text for other formats."));
            }
        }

        AiResumeParseService.Result r = aiResumeParseService.parse(vm.getText(), vm.getFileBase64(), vm.getFileMimeType(), vm.isConsent());
        Map<String, Object> body = new HashMap<>();
        switch (r.status()) {
            case OK -> {
                body.put("parsed", r.parsed());
                body.put("used", r.used());
                body.put("quota", r.quota());
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
                body.put("error", "The AI provider could not parse the resume right now.");
                return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(body);
            }
        }
    }
}
