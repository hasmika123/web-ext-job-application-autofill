package com.dossier.api.web.rest.ent;

import com.dossier.api.service.ent.billing.OrgBillingReadService;
import com.dossier.api.service.ent.billing.OrgUsageReadService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The organization billing pages, read-only (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1a): Subscription Overview, Billing &amp; Invoices and Feature
 * Usage. Nothing here writes or calls Stripe. The {@code billing} module ({@code flag.enterprise.billing}) must be on for the organization; without it,
 * or without {@code billing.view} / {@code usage.view}, every route is the generic 404.
 */
@RestController("entOrgBillingResource")
@RequestMapping("/api/orgs/{orgId}")
@Tag(name = "Organization billing")
public class OrgBillingResource {

    private final OrgBillingReadService billing;
    private final OrgUsageReadService usage;

    public OrgBillingResource(OrgBillingReadService billing, OrgUsageReadService usage) {
        this.billing = billing;
        this.usage = usage;
    }

    @Operation(summary = "Subscription Overview", description = "billing.view. Consultants, licensed, unlicensed; monthly recurring (null = price not set); next invoice; licences and add-ons ending; contract; overdue invoices; status SETUP until a billing account exists.")
    @GetMapping("/billing/overview")
    @OrgPermissionRequired
    public OrgBillingReadService.Overview overview(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return billing.overview(me);
    }

    @Operation(summary = "Billing account", description = "billing.view. Account (status, currency, collection method, cycle, period), payment method on file (brand and last 4 only), contract, whether Stripe is connected.")
    @GetMapping("/billing")
    @OrgPermissionRequired
    public OrgBillingReadService.Billing account(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return billing.billing(me);
    }

    @Operation(summary = "Invoices", description = "billing.view. Newest first, 25 a page; status filter DRAFT, OPEN, PAID, VOID or UNCOLLECTIBLE. estimate = a LOCAL record (no money moved).")
    @GetMapping("/billing/invoices")
    @OrgPermissionRequired
    public OrgBillingReadService.InvoicePage invoices(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String status,
        @RequestParam(defaultValue = "0") int page
    ) {
        return billing.invoices(me, status, page);
    }

    @Operation(summary = "One invoice", description = "billing.view. The invoice with its lines and payments. 404 for another organization's invoice.")
    @GetMapping("/billing/invoices/{invoiceId}")
    @OrgPermissionRequired
    public OrgBillingReadService.InvoiceDetail invoice(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long invoiceId) {
        return billing.invoice(me, invoiceId);
    }

    @Operation(summary = "Feature usage for a month", description = "usage.view. Per licensed consultant: AI budget used in percent (current month, when the licence carries AI), job-match views, interview-prep sessions, applications tracked; totals per feature. period = YYYY-MM within the last 12 months (default: this month).")
    @GetMapping("/usage")
    @OrgPermissionRequired
    public OrgUsageReadService.Usage usage(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestParam(required = false) String period) {
        return usage.usage(me, period);
    }

    @Operation(summary = "Feature usage by month", description = "usage.view. The organization's totals per month, oldest first, ending with this month (1 to 12 months, default 6).")
    @GetMapping("/usage/history")
    @OrgPermissionRequired
    public OrgUsageReadService.History history(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestParam(defaultValue = "6") int months) {
        return usage.history(me, months);
    }
}
