package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.FillTelemetryService;
import com.dossier.api.service.dto.FillTelemetryDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Fill telemetry from the extension (Phase 10.1): counts per autofill run, ranked by ATS in the
 * admin panel so adapter work (10.4) is directed by data rather than guessed.
 *
 * <p>Authenticated — the extension is signed in whenever it fills — but nothing about the caller
 * is stored. Both endpoints answer 204 whether or not anything was written, so they reveal
 * nothing about which fills exist.
 */
@RestController
@RequestMapping("/api/telemetry")
@Tag(name = "telemetry", description = "Count-only autofill quality signals. No values, no hostnames, not linked to accounts.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class FillTelemetryResource {

    private final FillTelemetryService fillTelemetryService;

    public FillTelemetryResource(FillTelemetryService fillTelemetryService) {
        this.fillTelemetryService = fillTelemetryService;
    }

    @Operation(summary = "Record one autofill run", description = "Counts only. 400 for a malformed id.")
    @PostMapping("/fills")
    public ResponseEntity<Void> recordFill(@RequestBody FillTelemetryDTO body) {
        if (body == null || !FillTelemetryService.isValidId(body.id())) return ResponseEntity.badRequest().build();
        fillTelemetryService.record(body);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "The user corrected a field after a fill", description = "Bounded server-side; always 204.")
    @PostMapping("/fills/{id}/correction")
    public ResponseEntity<Void> recordCorrection(@PathVariable("id") String id) {
        fillTelemetryService.recordCorrection(id);
        return ResponseEntity.noContent().build();
    }
}
