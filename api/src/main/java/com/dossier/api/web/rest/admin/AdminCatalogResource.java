package com.dossier.api.web.rest.admin;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.catalog.CatalogService;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.CatalogDTO;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.CatalogVersionDTO;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceDTO;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceRequest;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PublishPriceRequest;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.RetirePriceRequest;
import java.util.List;
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

/**
 * Platform admin: the catalog as a whole, prices and catalog versions (docs/subscriptions/09-apis.md section 1.2; story K1.3). {@code ROLE_ADMIN} only;
 * publishing and retiring a price are HIGH and carry a reason. Prices are immutable rows: there is no update route, a new price is a new row.
 */
@RestController
@RequestMapping("/api/admin/catalog")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminCatalogResource {

    private final CatalogService catalog;

    public AdminCatalogResource(CatalogService catalog) {
        this.catalog = catalog;
    }

    /** Products, prices, services, presets, volume tiers, the margin floors, the fee model and the catalog version in one answer. */
    @GetMapping
    public CatalogDTO catalog() {
        return catalog.catalog();
    }

    @GetMapping("/prices")
    public List<PriceDTO> prices(@RequestParam(value = "productId", required = false) Long productId) {
        return catalog.prices(productId);
    }

    /** A new DRAFT price: nothing is live until it is published. */
    @PostMapping("/prices")
    public ResponseEntity<PriceDTO> createPrice(@RequestBody PriceRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(catalog.createDraft(body));
    }

    @PostMapping("/prices/{id}/publish")
    public PriceDTO publish(@PathVariable("id") Long id, @RequestBody(required = false) PublishPriceRequest body) {
        return catalog.publish(id, body);
    }

    @PostMapping("/prices/{id}/retire")
    public PriceDTO retire(@PathVariable("id") Long id, @RequestBody(required = false) RetirePriceRequest body) {
        return catalog.retire(id, body);
    }

    @GetMapping("/versions")
    public List<CatalogVersionDTO> versions() {
        return catalog.versions();
    }

    @GetMapping("/versions/{n}")
    public CatalogVersionDTO version(@PathVariable("n") int n) {
        return catalog.version(n);
    }
}
