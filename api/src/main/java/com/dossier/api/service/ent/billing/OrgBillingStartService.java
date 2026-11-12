package com.dossier.api.service.ent.billing;

import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.billing.OrgBillingAccountRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Starting billing for an organization (docs/enterprise-v2/ORG-BILLING-BUILD.md step 2; user decision 2026-11-12: the platform admin starts it). Starting
 * creates the organization's billing account and its first billing period. The account has a billing email, bills in USD, sends invoices that are paid
 * within 15 days, and its period runs from today to the end of the month.
 *
 * <p>The setup fee (user decisions 2026-11-11):
 * <ul>
 *   <li>The organization is usable at once; the fee is a line on its <b>first invoice</b>.</li>
 *   <li>An organization that existed when this shipped ({@code organization.setup_fee_exempt}) is never charged.</li>
 *   <li>The admin may also waive the fee, with a reason.</li>
 *   <li>The amount is the published ORG one-time price of {@code ORG_SETUP_FEE}; with no price published yet, the fee stays OWED, and is never $0.</li>
 * </ul>
 *
 * <p>Stripe, only when {@code enterprise.billing.stripe_enabled} is on AND a Stripe key is configured:
 * <ul>
 *   <li>Stripe calls happen first, each with an idempotency key ({@code orgcust-{orgId}}, {@code orgsetup-{orgId}}), so a failure saves nothing and a retry
 *       returns the same Stripe objects.</li>
 *   <li>One customer is created ({@code kiwiply_scope=org}).</li>
 *   <li>An owed, priced fee becomes a pending invoice item. It waits for the organization's first invoice, which step 3's subscription creates.</li>
 * </ul>
 * Otherwise billing stays local: nothing is sent to Stripe and nothing is charged.
 *
 * <p>Every start writes an admin audit row and a HIGH row in the organization's own trail.
 */
@Service
public class OrgBillingStartService {

    public static final String SETUP_FEE_PRODUCT = "ORG_SETUP_FEE";
    static final Pattern EMAIL = Pattern.compile("^[^@\\s]{1,64}@[^@\\s]+\\.[^@\\s]+$");

    /** The setup fee: WAIVED, OWED (not on an invoice yet), ADDED (a pending Stripe invoice item) or PAID. {@code amountMinor} null = price not set. */
    public record SetupFee(String status, Long amountMinor, String note) {}

    /** What the platform admin's Billing panel shows. {@code account} is null until billing is started. */
    public record Status(
        Long orgId,
        boolean started,
        boolean stripeReady,
        boolean setupFeeExempt,
        Long setupFeePriceMinor,
        Account account
    ) {}

    public record Account(
        String billingEmail,
        String currency,
        String collectionMethod,
        LocalDate periodStart,
        LocalDate periodEnd,
        LocalDate nextInvoiceOn,
        String source,
        boolean stripeCustomer,
        SetupFee setupFee,
        String startedBy,
        Instant startedAt
    ) {}

    /** {@code waiveSetupFee}: waive the fee of an organization that is not exempt. {@code reason} is required (3+ characters). */
    public record StartRequest(String billingEmail, Boolean waiveSetupFee, String reason) {}

    private final OrganizationRepository organizations;
    private final OrgBillingAccountRepository accounts;
    private final ProductRepository products;
    private final ProductPriceRepository prices;
    private final StripeGateway stripe;
    private final SettingsService settings;
    private final AdminAuditService adminAudit;
    private final OrgAuditService orgAudit;
    private final TransactionTemplate tx;
    private Clock clock = Clock.systemUTC();

    public OrgBillingStartService(
        OrganizationRepository organizations,
        OrgBillingAccountRepository accounts,
        ProductRepository products,
        ProductPriceRepository prices,
        StripeGateway stripe,
        SettingsService settings,
        AdminAuditService adminAudit,
        OrgAuditService orgAudit,
        PlatformTransactionManager txManager
    ) {
        this.organizations = organizations;
        this.accounts = accounts;
        this.products = products;
        this.prices = prices;
        this.stripe = stripe;
        this.settings = settings;
        this.adminAudit = adminAudit;
        this.orgAudit = orgAudit;
        this.tx = new TransactionTemplate(txManager);
    }

    /** Tests pin the time. */
    void setClock(Clock clock) {
        this.clock = clock;
    }

    /** The organization's billing as the platform admin sees it. 404 for an unknown organization. */
    public Status status(Long orgId) {
        Organization org = organizations.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        Optional<OrgBillingAccount> a = accounts.findFirstByOrgId(orgId);
        return new Status(orgId, a.isPresent(), stripeReady(), org.getSetupFeeExempt(), setupFeePrice(), a.map(OrgBillingStartService::account).orElse(null));
    }

    /** Start billing. 409 {@code BILLING_STARTED} when it already has a billing account; 502 {@code BILLING_PROVIDER} when Stripe fails (nothing saved). */
    public Status start(Long orgId, StartRequest req) {
        Organization org = organizations.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        if (accounts.findFirstByOrgId(orgId).isPresent()) throw new OrgException(409, "BILLING_STARTED", "Billing has already been started for this organization.", null);
        String email = email(req == null ? null : req.billingEmail());
        String reason = reason(req == null ? null : req.reason());
        boolean exempt = org.getSetupFeeExempt();
        boolean waived = exempt || (req != null && Boolean.TRUE.equals(req.waiveSetupFee()));
        Long fee = waived ? null : setupFeePrice();
        String feeStatus = waived ? "WAIVED" : "OWED";
        String note = exempt ? "The organization existed before setup fees." : waived ? "Waived: " + reason : fee == null ? "Price not set yet." : null;

        String customerId = null;
        String itemId = null;
        if (stripeReady()) {
            try {
                customerId = stripe.createOrgCustomer(email, name(org), orgId, IdempotencyKey.of("orgcust", orgId));
                if (fee != null && fee > 0) {
                    itemId = stripe.createInvoiceItem(customerId, fee, "USD", "Organization setup fee", null, Map.of("kind", "org_setup", "org_id", String.valueOf(orgId)), IdempotencyKey.of("orgsetup", orgId));
                    feeStatus = "ADDED";
                    note = "On the first invoice.";
                }
            } catch (StripeGatewayException e) {
                throw new OrgException(502, "BILLING_PROVIDER", "Stripe could not be reached, so nothing was saved. Try again.", null);
            }
        }

        Instant now = Instant.now(clock).truncatedTo(ChronoUnit.MICROS);
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        String cid = customerId;
        String iid = itemId;
        String fs = feeStatus;
        String nt = note;
        String login = SecurityUtils.getCurrentUserLogin().orElse(OrgAuditService.SYSTEM_ACTOR);
        tx.executeWithoutResult(s -> {
            OrgBillingAccount a = new OrgBillingAccount();
            a.setOrgId(orgId);
            a.setBillingEmail(email);
            a.setCurrency("USD");
            a.setCollectionMethod("SEND_INVOICE");
            a.setStatus("ACTIVE");
            a.setBillingCycle("MONTH");
            a.setCurrentPeriodStart(today);
            a.setCurrentPeriodEnd(today.withDayOfMonth(today.lengthOfMonth()));
            a.setNextInvoiceOn(today.withDayOfMonth(today.lengthOfMonth()).plusDays(1));
            a.setSource(cid == null ? "LOCAL" : "STRIPE");
            a.setStripeCustomerId(cid);
            a.setSetupFeeStatus(fs);
            a.setSetupFeeAmountMinor(fee);
            a.setSetupFeeItemId(iid);
            a.setSetupFeeNote(nt);
            a.setStartedByLogin(login);
            a.setStartedAt(now);
            a.setCreatedAt(now);
            a.setUpdatedAt(now);
            accounts.saveAndFlush(a);
            org.setBillingEmail(email);
            if (cid != null) org.setStripeCustomerId(cid);
            org.setUpdatedAt(now);
            organizations.save(org);
            String details = "billing started source=" + (cid == null ? "LOCAL" : "STRIPE") + " setupFee=" + fs + (fee == null ? "" : " amountMinor=" + fee);
            adminAudit.record(AdminAuditService.ORG_BILLING_START, AdminAuditService.TARGET_ORG, String.valueOf(orgId), reason, details);
            orgAudit.record(orgId, login, null, OrgAuditService.ADMIN_BILLING_START, OrgAuditService.TARGET_ORG, null, String.valueOf(orgId), details + " reason=" + reason, null, null, null, "HIGH");
        });
        return status(orgId);
    }

    /** Stripe is used only when the platform admin switched it on AND a Stripe key is configured. */
    public boolean stripeReady() {
        return settings.getBool(EnterpriseSettingKeys.BILLING_STRIPE_ENABLED) && stripe.isEnabled();
    }

    /** The published ORG one-time price of the setup fee in USD, or null (price not set). */
    Long setupFeePrice() {
        return products.findByCode(SETUP_FEE_PRODUCT)
            .flatMap(p -> prices.findActive(p.getId(), "ORG", "ONE_TIME", "USD"))
            .map(ProductPrice::getAmountMinor)
            .filter(v -> v != null && v > 0)
            .orElse(null);
    }

    static Account account(OrgBillingAccount a) {
        return new Account(
            a.getBillingEmail(),
            a.getCurrency(),
            a.getCollectionMethod(),
            a.getCurrentPeriodStart(),
            a.getCurrentPeriodEnd(),
            a.getNextInvoiceOn(),
            a.getSource(),
            a.getStripeCustomerId() != null,
            a.getSetupFeeStatus() == null ? null : new SetupFee(a.getSetupFeeStatus(), a.getSetupFeeAmountMinor(), a.getSetupFeeNote()),
            a.getStartedByLogin(),
            a.getStartedAt()
        );
    }

    private static String name(Organization org) {
        return org.getDisplayName() != null && !org.getDisplayName().isBlank() ? org.getDisplayName() : org.getName();
    }

    static String email(String raw) {
        String e = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (e.length() > 254 || !EMAIL.matcher(e).matches()) throw OrgException.invalid("billingEmail", "must be an e-mail address");
        return e;
    }

    private static String reason(String raw) {
        String r = raw == null ? "" : raw.trim();
        if (r.length() < 3) throw OrgException.invalid("reason", "say why (at least 3 characters)");
        com.dossier.api.service.privacy.SensitiveContent.check("reason", "reason", r); // free text: never an SSN, bank or ID number (CLAUDE.md)
        return r.length() > 200 ? r.substring(0, 200) : r;
    }
}
