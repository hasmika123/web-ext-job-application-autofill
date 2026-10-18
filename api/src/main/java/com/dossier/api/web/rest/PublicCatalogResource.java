package com.dossier.api.web.rest;

import com.dossier.api.service.catalog.PublicCatalogService;
import com.dossier.api.service.dto.PublicCatalogDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The public catalog the pricing page renders (docs/subscriptions/09-apis.md section 2; story K5.1). No account, read-only, cached
 * ({@code billing.public_catalog.cache_seconds}). Only the INDIVIDUAL audience is served here; organizations are priced on their own pages.
 */
@RestController
@RequestMapping("/api/catalog/public")
@Tag(name = "catalog-public", description = "Published, public plans with prices per interval, included and optional services, and precomputed totals. No auth.")
public class PublicCatalogResource {

    private final PublicCatalogService catalog;

    public PublicCatalogResource(PublicCatalogService catalog) {
        this.catalog = catalog;
    }

    @Operation(
        summary = "The public catalog",
        description = "PUBLISHED, public, effective individual plans only; drafts and SUNSET plans never appear. Prices per interval (MONTH, QUARTER, YEAR when annual is on), included services, optional add-ons that have a price, and totals for one add-on at quantity 1-2 and every pair at quantity 1. `country` filters plans limited to countries."
    )
    @GetMapping
    public ResponseEntity<PublicCatalogDTO> get(@RequestParam(required = false) String audience, @RequestParam(required = false) String country) {
        PublicCatalogDTO dto = catalog.catalog(country);
        if (audience != null && !audience.isBlank() && !"INDIVIDUAL".equalsIgnoreCase(audience.trim())) {
            dto = new PublicCatalogDTO(dto.catalogVersion(), dto.currency(), List.of(), dto.annualEnabled(), dto.consentText(), List.of(), Map.of());
        }
        return ResponseEntity.ok().cacheControl(cache()).body(dto);
    }

    @Operation(summary = "One public plan", description = "404 for a plan that does not exist or is not public.")
    @GetMapping("/plans/{planKey}")
    public ResponseEntity<PublicCatalogDTO.Plan> plan(@PathVariable String planKey, @RequestParam(required = false) String country) {
        PublicCatalogDTO.Plan plan = catalog.plan(planKey, country).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such plan"));
        return ResponseEntity.ok().cacheControl(cache()).body(plan);
    }

    private CacheControl cache() {
        int seconds = catalog.cacheSeconds();
        return seconds <= 0 ? CacheControl.noStore() : CacheControl.maxAge(Duration.ofSeconds(seconds)).cachePublic();
    }
}
