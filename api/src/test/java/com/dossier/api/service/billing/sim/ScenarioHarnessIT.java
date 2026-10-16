package com.dossier.api.service.billing.sim;

import com.dossier.api.IntegrationTest;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.BillingDriftRepository;
import com.dossier.api.repository.sub.InvoiceRepository;
import com.dossier.api.repository.sub.SubscriptionAddonRepository;
import com.dossier.api.service.MailService;
import com.dossier.api.service.billing.BillingWebhookService;
import com.dossier.api.service.billing.StripeGateway.PriceInterval;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.billing.reconcile.PersonalBillingReconciler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.Arrays;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * K8.6: every money path of the personal module replayed in CI, forever. Each {@code src/test/resources/billing-scenarios/*.json} script drives Kiwiply's
 * real routes and the real webhook service against the {@link StatefulFakeStripeGateway} (see {@link ScenarioRunner} for the script language). Adding a
 * scenario is adding a file; nothing here changes. Test mode only, no network, no Stripe account: the one human step (the same lap on a real test clock with the
 * object ids recorded) is the runbook in docs/subscriptions/README.md.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "user")
@Import({ SubFixtures.CatalogPortConfig.class, StatefulFakeStripeGateway.Config.class })
class ScenarioHarnessIT {

    @Autowired private MockMvc mockMvc;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private SubscriptionAddonRepository addons;
    @Autowired private InvoiceRepository invoices;
    @Autowired private BillingDriftRepository drifts;
    @Autowired private BillingWebhookService webhook;
    @Autowired private PersonalBillingReconciler reconciler;
    @Autowired private StatefulFakeStripeGateway stripe;
    @MockitoBean private MailService mail;

    @BeforeEach
    void world() {
        stripe.reset();
        SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
        stripe.definePrice(SubFixtures.BASE_MONTH, 1999, PriceInterval.MONTH);
        stripe.definePrice(SubFixtures.BASE_QUARTER, 4999, PriceInterval.QUARTER);
        stripe.definePrice(SubFixtures.AI_MONTH, 499, PriceInterval.MONTH);
        stripe.definePrice(SubFixtures.AI_QUARTER, 1299, PriceInterval.QUARTER);
        stripe.definePrice(SubFixtures.PACK_MONTH, 299, PriceInterval.MONTH);
        users.findOneByLogin("user").flatMap(u -> subscriptions.findOneByUserId(u.getId())).ifPresent(s -> {
            subscriptions.delete(s);
            subscriptions.flush();
        });
    }

    static Stream<String> scenarios() throws Exception {
        Resource[] found = new PathMatchingResourcePatternResolver().getResources("classpath:billing-scenarios/*.json");
        return Arrays.stream(found).map(Resource::getFilename).sorted();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("scenarios")
    void scenario(String file) throws Exception {
        JsonNode script;
        try (InputStream in = getClass().getResourceAsStream("/billing-scenarios/" + file)) {
            script = new ObjectMapper().readTree(in);
        }
        ScenarioRunner.Env env = new ScenarioRunner.Env(
            mockMvc, stripe, webhook, subscriptions, addons, invoices, users, drifts, reconciler, mail,
            () -> {
                em.flush();
                em.clear();
            },
            "user"
        );
        new ScenarioRunner(env).run(script);
    }
}
