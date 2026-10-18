package com.dossier.api.service.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.StripeEvent;
import com.dossier.api.domain.User;
import com.dossier.api.repository.StripeEventRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.service.BillingException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.PlatformTransactionManager;

/** K8.1: the scope router (account kind and webhook routing) and the routing in front of the webhook handlers (WebhookScopeRouterTest). */
class BillingScopeRouterTest {

    @SuppressWarnings("unchecked")
    private static BillingScopeRouter router(OrgBillingCustomerLookup lookup) {
        ObjectProvider<OrgBillingCustomerLookup> p = mock(ObjectProvider.class);
        when(p.getIfAvailable(any(Supplier.class))).thenAnswer(i -> lookup == null ? ((Supplier<?>) i.getArgument(0)).get() : lookup);
        return new BillingScopeRouter(p);
    }

    private static User user(Long orgId) {
        User u = new User();
        u.setLogin(orgId == null ? "personal" : "ent#" + orgId);
        u.setOrgId(orgId);
        return u;
    }

    private static StripeWebhookEvent event(String customer, String scope, Long orgId, String app) {
        return new StripeWebhookEvent(
            "evt_" + System.nanoTime(),
            "customer.subscription.updated",
            Instant.now(),
            "subscription",
            customer,
            "sub_1",
            "active",
            "price",
            null,
            false,
            null,
            null,
            null,
            app,
            null,
            scope,
            orgId,
            null,
            List.of(),
            null,
            null,
            null,
            null
        );
    }

    @Test
    @DisplayName("Account kind: personal goes to the personal path, enterprise never does")
    void accountKind() {
        BillingScopeRouter r = router(null);
        assertThat(r.scopeOf(user(null))).isEqualTo(BillingScope.PERSONAL);
        assertThat(r.scopeOf(user(5L))).isEqualTo(BillingScope.ORG);
        assertThat(r.requirePersonal(user(null))).isNotNull();
        assertThatThrownBy(() -> r.requirePersonal(user(5L))).isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getStatus()).isEqualTo(404));
    }

    @Test
    @DisplayName("Organization billing: only an enterprise account of exactly that organization passes; personal and other organizations get the generic 404")
    void orgGuard() {
        BillingScopeRouter r = router(null);
        assertThat(r.requireOrg(user(5L), 5L)).isNotNull();
        assertThatThrownBy(() -> r.requireOrg(user(null), 5L)).isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getStatus()).isEqualTo(404));
        assertThatThrownBy(() -> r.requireOrg(user(6L), 5L)).isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getStatus()).isEqualTo(404));
        assertThatThrownBy(() -> r.requireOrg(user(5L), null)).isInstanceOf(BillingException.class);
        assertThatThrownBy(() -> r.requireOrg(null, 5L)).isInstanceOf(BillingException.class);
    }

    @Test
    @DisplayName("Webhook routing table: org tag, personal tag, org customer, unknown customer, another app")
    void routingTable() {
        BillingScopeRouter r = router(id -> id.equals("cus_org"));
        assertThat(r.routeOf(event("cus_x", "org", 3L, "kiwiply"))).isEqualTo(BillingScopeRouter.Route.ORG);
        assertThat(r.routeOf(event("cus_x", "personal", null, "kiwiply"))).isEqualTo(BillingScopeRouter.Route.PERSONAL);
        assertThat(r.routeOf(event("cus_org", null, null, null))).isEqualTo(BillingScopeRouter.Route.ORG);
        assertThat(r.routeOf(event("cus_unknown", null, null, null))).isEqualTo(BillingScopeRouter.Route.PERSONAL);
        assertThat(r.routeOf(event("cus_org", "org", 3L, "beecompete"))).isEqualTo(BillingScopeRouter.Route.IGNORED);
        assertThat(r.routeOf(event(null, null, null, null))).isEqualTo(BillingScopeRouter.Route.PERSONAL);
        assertThat(BillingScopeRouter.Route.ORG.label()).isEqualTo("org");
    }

    /** Builds the webhook service on mocks and runs one event through record-then-apply. */
    private record Rig(BillingWebhookService service, UserBillingHandler user, OrgBillingWebhookHandler org, SubscriptionRepository subs) {}

    @SuppressWarnings("unchecked")
    private static Rig rig(OrgBillingCustomerLookup lookup) {
        StripeEventRepository events = mock(StripeEventRepository.class);
        when(events.findById(anyString())).thenReturn(Optional.empty());
        when(events.saveAndFlush(any(StripeEvent.class))).thenAnswer(i -> i.getArgument(0));
        SubscriptionRepository subs = mock(SubscriptionRepository.class);
        UserBillingHandler user = mock(UserBillingHandler.class);
        OrgBillingWebhookHandler org = mock(OrgBillingWebhookHandler.class);
        ObjectProvider<OrgBillingWebhookHandler> orgProvider = mock(ObjectProvider.class);
        when(orgProvider.getIfAvailable(any(Supplier.class))).thenReturn(org);
        BillingWebhookService s = new BillingWebhookService(events, subs, router(lookup), user, orgProvider, mock(PlatformTransactionManager.class));
        return new Rig(s, user, org, subs);
    }

    @Test
    @DisplayName("An organization event reaches the organization handler only; the personal handler and the personal mirror are never touched")
    void orgEventNeverTouchesPersonal() {
        Rig rig = rig(null);
        StripeWebhookEvent e = event("cus_1", "org", 3L, "kiwiply");

        assertThat(rig.service().handle(e)).isEqualTo(BillingWebhookService.Outcome.PROCESSED);

        verify(rig.org()).apply(e);
        verifyNoInteractions(rig.user());
        verify(rig.subs(), never()).save(any());
    }

    @Test
    @DisplayName("A personal event reaches the personal handler only; another app's event reaches neither")
    void personalAndForeign() {
        Rig rig = rig(null);
        StripeWebhookEvent mine = event("cus_1", null, null, "kiwiply");
        rig.service().handle(mine);
        verify(rig.user()).apply(mine);
        verifyNoInteractions(rig.org());

        Rig other = rig(null);
        other.service().handle(event("cus_1", null, null, "beecompete"));
        verifyNoInteractions(other.user(), other.org());
    }
}
