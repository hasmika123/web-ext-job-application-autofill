package com.dossier.api.service.billing;

import com.dossier.api.domain.User;
import com.dossier.api.service.BillingException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

/**
 * K8.1: the one place that decides which Stripe world an operation belongs to.
 *
 * <ul>
 *   <li><b>By account kind</b> (outbound operations): a personal account ({@code user.org_id} is null) uses the personal customer and subscription
 *       path; an enterprise account never does. A mismatch is the generic {@code 404} (it must not reveal that the other world exists).
 *   <li><b>By event</b> (inbound webhooks, docs/subscriptions/07 s5): {@code kiwiply_scope} metadata, else the customer lookup, else personal; another
 *       app's event (BeeCompete tag) is ignored.
 * </ul>
 *
 * Pure decisions, no database writes. Nothing here calls Stripe.
 */
@Service
public class BillingScopeRouter {

    /** Where an inbound event goes. */
    public enum Route {
        PERSONAL,
        ORG,
        IGNORED;

        /** The value stored in {@code stripe_event.scope}. */
        public String label() {
            return name().toLowerCase();
        }
    }

    private final ObjectProvider<OrgBillingCustomerLookup> orgCustomers;

    public BillingScopeRouter(ObjectProvider<OrgBillingCustomerLookup> orgCustomers) {
        this.orgCustomers = orgCustomers;
    }

    /** The scope of an account: ORG for an enterprise account, PERSONAL otherwise. */
    public BillingScope scopeOf(User user) {
        return user != null && user.getOrgId() != null ? BillingScope.ORG : BillingScope.PERSONAL;
    }

    /** Guard for the personal path: an enterprise account gets the generic 404 and never reaches personal billing. */
    public User requirePersonal(User user) {
        if (scopeOf(user) != BillingScope.PERSONAL) throw notFound();
        return user;
    }

    /** Guard for an organization's billing: the account must be an enterprise account of exactly {@code orgId}; personal accounts and other organizations' accounts get the generic 404. */
    public User requireOrg(User user, Long orgId) {
        if (user == null || orgId == null || user.getOrgId() == null || !orgId.equals(user.getOrgId())) throw notFound();
        return user;
    }

    /** Where a verified webhook event goes. Other apps' events are ignored; an event that says nothing and names no organization customer is personal. */
    public Route routeOf(StripeWebhookEvent event) {
        if (event.taggedForAnotherApp()) return Route.IGNORED;
        if (event.isOrgScoped()) return Route.ORG;
        if (StripeWebhookEvent.SCOPE_PERSONAL.equalsIgnoreCase(event.scope() == null ? "" : event.scope().trim())) return Route.PERSONAL;
        String customer = event.customerId();
        if (customer != null && orgCustomers.getIfAvailable(() -> OrgBillingCustomerLookup.NONE).isOrgCustomer(customer)) return Route.ORG;
        return Route.PERSONAL;
    }

    private static BillingException notFound() {
        return new BillingException(404, "NOT_FOUND", "Not found");
    }
}
