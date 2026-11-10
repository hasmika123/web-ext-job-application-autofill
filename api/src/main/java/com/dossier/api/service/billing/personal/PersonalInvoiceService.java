package com.dossier.api.service.billing.personal;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.sub.PriceLookupRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.BillingScopeRouter;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.InvoiceLine;
import com.dossier.api.service.billing.StripeGateway.InvoiceSummary;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.dto.InvoiceDTO;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code GET /api/billing/invoices} (docs/subscriptions/09-apis.md section 3.3; story K5.7): the signed-in account's last 36 invoices, newest first. Reads the
 * invoice mirror through {@link PersonalInvoiceSource} when it exists (K8.3); until then asks Stripe for the customer's invoices (read-only), and answers an
 * empty list when billing is off or the account has never checked out.
 */
@Service
@Transactional(readOnly = true)
public class PersonalInvoiceService {

    private static final Logger LOG = LoggerFactory.getLogger(PersonalInvoiceService.class);
    static final int LIMIT = 36;

    private final UserRepository users;
    private final BillingScopeRouter router;
    private final SubscriptionRepository subscriptions;
    private final StripeGateway gateway;
    private final ObjectProvider<PersonalInvoiceSource> source;
    private final PriceLookupRepository prices;
    private final ProductRepository products;

    public PersonalInvoiceService(
        UserRepository users,
        BillingScopeRouter router,
        SubscriptionRepository subscriptions,
        StripeGateway gateway,
        ObjectProvider<PersonalInvoiceSource> source,
        PriceLookupRepository prices,
        ProductRepository products
    ) {
        this.users = users;
        this.router = router;
        this.subscriptions = subscriptions;
        this.gateway = gateway;
        this.source = source;
        this.prices = prices;
        this.products = products;
    }

    public List<InvoiceDTO> mine(String login) {
        User user = users.findOneByLogin(login).orElseThrow(() -> new BillingException(401, "UNAUTHENTICATED", "Sign in to continue"));
        router.requirePersonal(user);
        PersonalInvoiceSource mirror = source.getIfAvailable();
        if (mirror != null) return mirror.invoicesOf(user.getId(), LIMIT);

        Subscription sub = subscriptions.findOneByUserId(user.getId()).orElse(null);
        if (sub == null || sub.getStripeCustomerId() == null || !gateway.isEnabled()) return List.of();
        List<InvoiceSummary> found;
        try {
            found = gateway.listInvoices(sub.getStripeCustomerId(), LIMIT, null);
        } catch (StripeGatewayException e) {
            LOG.error("Listing invoices failed: {}", e.getKind());
            throw new BillingException(502, BillingException.CODE_STRIPE_ERROR, "Stripe couldn't complete that");
        }
        Map<String, String> kindByPrice = kinds(found);
        List<InvoiceDTO> out = new ArrayList<>();
        for (InvoiceSummary i : found) {
            List<InvoiceDTO.Line> lines = new ArrayList<>();
            for (InvoiceLine l : i.lines()) {
                String kind = l.proration() ? "PRORATION" : kindByPrice.getOrDefault(l.priceId(), "OTHER");
                Long unit = !l.proration() && l.quantity() > 0 ? l.amountMinor() / l.quantity() : null;
                lines.add(new InvoiceDTO.Line(kind, l.description(), l.quantity(), unit, l.amountMinor(), l.proration()));
            }
            out.add(new InvoiceDTO(i.number(), i.status(), i.amountPaidMinor(), i.currency() == null ? null : i.currency().toUpperCase(), i.periodStart(), i.periodEnd(), i.paidAt(), i.hostedUrl(), i.pdfUrl(), List.copyOf(lines)));
        }
        return out;
    }

    /** Stripe price id to BASE or ADDON, for the prices that are catalog prices. */
    private Map<String, String> kinds(List<InvoiceSummary> invoices) {
        List<String> ids = invoices.stream().flatMap(i -> i.lines().stream()).map(InvoiceLine::priceId).filter(java.util.Objects::nonNull).distinct().toList();
        Map<String, String> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        for (ProductPrice p : prices.findByStripePriceIdIn(ids)) {
            Product product = products.findById(p.getProductId()).orElse(null);
            if (product == null) continue;
            out.put(p.getStripePriceId(), "SUBSCRIPTION".equals(product.getKind()) ? "BASE" : "ADDON");
        }
        return out;
    }
}
