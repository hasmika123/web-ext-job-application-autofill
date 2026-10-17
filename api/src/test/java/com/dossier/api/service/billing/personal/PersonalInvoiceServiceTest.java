package com.dossier.api.service.billing.personal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import com.dossier.api.service.dto.InvoiceDTO;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

/** K5.7: the invoice list reads the mirror when it exists, else Stripe (read-only), and maps lines to BASE, ADDON or PRORATION. */
class PersonalInvoiceServiceTest {

    private final UserRepository users = mock(UserRepository.class);
    private final SubscriptionRepository subscriptions = mock(SubscriptionRepository.class);
    private final StripeGateway gateway = mock(StripeGateway.class);
    private final PriceLookupRepository prices = mock(PriceLookupRepository.class);
    private final ProductRepository products = mock(ProductRepository.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<PersonalInvoiceSource> source = mock(ObjectProvider.class);
    private final BillingScopeRouter router = new BillingScopeRouter(org.mockito.Mockito.mock(ObjectProvider.class));
    private User user;
    private PersonalInvoiceService service;

    @BeforeEach
    void setUp() {
        user = new User();
        user.setId(7L);
        user.setLogin("jo");
        when(users.findOneByLogin("jo")).thenReturn(Optional.of(user));
        service = new PersonalInvoiceService(users, router, subscriptions, gateway, source, prices, products);
    }

    @Test
    void theInvoiceMirrorWinsWhenItExists() {
        InvoiceDTO one = new InvoiceDTO("N-1", "paid", 1999, "USD", null, null, null, null, null, List.of());
        when(source.getIfAvailable()).thenReturn((userId, limit) -> userId == 7L && limit == 36 ? List.of(one) : List.of());
        assertThat(service.mine("jo")).containsExactly(one);
        verify(gateway, never()).listInvoices(anyString(), anyInt(), any());
    }

    @Test
    void withoutTheMirrorStripeIsAskedAndLinesAreClassified() {
        Subscription sub = new Subscription();
        sub.setStripeCustomerId("cus_1");
        when(subscriptions.findOneByUserId(7L)).thenReturn(Optional.of(sub));
        when(gateway.isEnabled()).thenReturn(true);
        InvoiceLine base = new InvoiceLine("price_base", 1, 1999, "Pro", Instant.EPOCH, Instant.EPOCH, false);
        InvoiceLine addon = new InvoiceLine("price_ai", 2, 998, "Extra AI credits", Instant.EPOCH, Instant.EPOCH, false);
        InvoiceLine pro = new InvoiceLine("price_ai", 1, 333, "Prorated: Extra AI credits x1", Instant.EPOCH, Instant.EPOCH, true);
        when(gateway.listInvoices("cus_1", 36, null)).thenReturn(List.of(new InvoiceSummary("in_1", "N-1", "paid", "usd", 3330, 3330, Instant.EPOCH, Instant.EPOCH, null, Instant.EPOCH, "https://h", "https://p", "sub_1", List.of(base, addon, pro))));
        ProductPrice pBase = new ProductPrice();
        pBase.setStripePriceId("price_base");
        pBase.setProductId(1L);
        ProductPrice pAi = new ProductPrice();
        pAi.setStripePriceId("price_ai");
        pAi.setProductId(2L);
        when(prices.findByStripePriceIdIn(any())).thenReturn(List.of(pBase, pAi));
        Product baseProduct = new Product();
        baseProduct.setKind("SUBSCRIPTION");
        Product aiProduct = new Product();
        aiProduct.setKind("FEATURE");
        when(products.findById(1L)).thenReturn(Optional.of(baseProduct));
        when(products.findById(2L)).thenReturn(Optional.of(aiProduct));

        List<InvoiceDTO> out = service.mine("jo");
        assertThat(out).hasSize(1);
        assertThat(out.get(0).currency()).isEqualTo("USD");
        assertThat(out.get(0).lines()).extracting(InvoiceDTO.Line::kind).containsExactly("BASE", "ADDON", "PRORATION");
        assertThat(out.get(0).lines().get(1).unitAmountMinor()).isEqualTo(499L);
        assertThat(out.get(0).lines().get(2).unitAmountMinor()).as("a proration has no unit price").isNull();
    }

    @Test
    void noCustomerOrBillingOffIsAnEmptyListNotAnError() {
        when(subscriptions.findOneByUserId(7L)).thenReturn(Optional.empty());
        assertThat(service.mine("jo")).isEmpty();
        Subscription sub = new Subscription();
        sub.setStripeCustomerId("cus_1");
        when(subscriptions.findOneByUserId(7L)).thenReturn(Optional.of(sub));
        when(gateway.isEnabled()).thenReturn(false);
        assertThat(service.mine("jo")).isEmpty();
    }

    @Test
    void anEnterpriseAccountGetsTheGenericNotFound() {
        user.setOrgId(3L);
        assertThatThrownBy(() -> service.mine("jo")).isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getStatus()).isEqualTo(404));
    }
}
