package com.dossier.api.web.rest.admin;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.catalog.MarginAdminService;
import com.dossier.api.service.catalog.MarginAdminService.FeeModelDTO;
import com.dossier.api.service.catalog.MarginAdminService.FeeModelRequest;
import com.dossier.api.service.catalog.MarginAdminService.FeeModelResult;
import com.dossier.api.service.catalog.MarginAdminService.MarginDTO;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Platform admin: the margin guard as an API (docs/subscriptions/09 section 1.2; wiring of K3.2). {@code GET /margin} answers "what would this price earn"
 * for any price, add-on, discounted price or service; {@code GET/PUT /fee-model} reads and changes the fee model the guard uses. {@code ROLE_ADMIN} only
 * (B-07); the PUT is HIGH and carries a reason.
 */
@RestController
@RequestMapping("/api/admin/catalog")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminCatalogMarginResource {

    private final MarginAdminService margin;

    public AdminCatalogMarginResource(MarginAdminService margin) {
        this.margin = margin;
    }

    @GetMapping("/margin")
    public MarginDTO margin(
        @RequestParam(value = "kind", required = false) String kind,
        @RequestParam(value = "audience", required = false) String audience,
        @RequestParam(value = "interval", required = false) String interval,
        @RequestParam("amountMinor") long amountMinor,
        @RequestParam(value = "aiBudgetCents", required = false, defaultValue = "0") long aiBudgetCents,
        @RequestParam(value = "quantity", required = false, defaultValue = "1") int quantity,
        @RequestParam(value = "payoutMinor", required = false, defaultValue = "0") long payoutMinor,
        @RequestParam(value = "discountBp", required = false, defaultValue = "0") int discountBp,
        @RequestParam(value = "currency", required = false) String currency
    ) {
        return margin.margin(kind, audience, interval, amountMinor, aiBudgetCents, quantity, payoutMinor, discountBp, currency);
    }

    @GetMapping("/fee-model")
    public FeeModelDTO feeModel() {
        return margin.feeModel();
    }

    /** Change the model and/or the schedule; the answer lists every published row that now sits below the floor. */
    @PutMapping("/fee-model")
    public FeeModelResult setFeeModel(@RequestBody FeeModelRequest body) {
        return margin.setFeeModel(body);
    }
}
