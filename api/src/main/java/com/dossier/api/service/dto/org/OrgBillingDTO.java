package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgStatus;
import java.util.List;

/**
 * {@code GET /api/orgs/{orgId}/billing}: where the org stands with money. Until org billing ships (Wave 5, O4.6 fills
 * this record in) it is a skeleton: the org's status, whether Stripe is connected here, and whether the billing-off
 * activation path is open for this environment. {@code subscription} is null and the two lists are empty until then.
 *
 * @param billingEnabled   Stripe is connected in this environment (false locally, in CI and on the demo box)
 * @param devActivation    the OWNER may activate a DRAFT workspace without paying: only when {@code billingEnabled}
 *                         is false and {@code dossier.orgs.dev-activate} is on (never in production)
 * @param subscription     the org's subscription mirror (O4.6); always null for now
 * @param items            per-person items bought (O4.6); always empty for now
 * @param invoices         the invoice mirror (O4.6); always empty for now
 */
public record OrgBillingDTO(OrgStatus status, boolean billingEnabled, boolean devActivation, Object subscription, List<Object> items, List<Object> invoices) {}
