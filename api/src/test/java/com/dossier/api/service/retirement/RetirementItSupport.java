package com.dossier.api.service.retirement;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.entitlement.PlanResolver;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CreateRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.StartRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.SuccessorRequest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Shared set-up of the retirement lifecycle tests (K10.5 to K10.11): the retiring plan TQ with its prices, the recording Stripe and mail doubles reset for every test, and the
 * helpers that start a retirement, create subscribers and read the database after the persistence context was flushed. Every concrete test class carries the same annotations
 * (so Spring reuses one context):
 * <pre>
 * &#64;IntegrationTest &#64;AutoConfigureMockMvc &#64;Transactional &#64;WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
 * &#64;Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
 * </pre>
 */
abstract class RetirementItSupport {

    @Autowired protected RetirementService retirements;
    @Autowired protected RetirementJob job;
    @Autowired protected RetirementNoticeJob noticeJob;
    @Autowired protected RetirementChoiceService choices;
    @Autowired protected RecordingStripeGateway stripe;
    @Autowired protected RecordingMailSender mail;
    @Autowired protected PlanRetirementItemRepository itemRepo;
    @Autowired protected SubscriptionRepository subscriptions;
    @Autowired protected UserRepository users;
    @Autowired protected EntitlementService entitlements;
    @Autowired protected ServiceLockService locks;
    @Autowired protected PlanResolver resolver;
    @Autowired protected JdbcTemplate jdbc;
    @jakarta.persistence.PersistenceContext protected jakarta.persistence.EntityManager em;

    protected SubFixtures.Plan plan;

    @BeforeEach
    void retirementBase() {
        stripe.reset();
        mail.reset();
        plan = SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
    }

    /** JDBC after the persistence context was flushed (a plain JDBC read does not flush). */
    protected JdbcTemplate db() {
        em.flush();
        return jdbc;
    }

    /** Create and start a retirement of TQ with the given default outcome and ranked successors. */
    protected RetirementDTO startRetirement(String outcome, String... successorKeys) {
        List<SuccessorRequest> succ = new ArrayList<>();
        int rank = 1;
        for (String k : successorKeys) succ.add(new SuccessorRequest(k, null, rank++, null));
        RetirementDTO d = retirements.create(new CreateRequest("PLAN", "TQ", null, null, null, outcome, null, null, null, null, RetirementFixtures.REASON, succ));
        return retirements.start(d.id(), new StartRequest(RetirementFixtures.REASON, "TQ"));
    }

    protected Subscription monthly(long endDays) {
        return RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "MONTH", "active", endDays, false, true);
    }

    protected PlanRetirementItem item(RetirementDTO r, Subscription s) {
        return itemRepo.findByRetirementIdAndSubscriptionId(r.id(), s.getId()).orElseThrow();
    }

    protected Map<String, Object> subRow(Long subscriptionId) {
        return db().queryForMap("select plan, status, price_id, plan_version_id, billing_interval, current_period_end, cancel_at_period_end, lapse_notice_pending from subscription where id = ?", subscriptionId);
    }

    protected String planStatus(String key) {
        return db().queryForObject("select status from plan where plan_key = ?", String.class, key);
    }

    /** The moment {@code hours} hours after an item's date. */
    protected static Instant after(PlanRetirementItem item, long hours) {
        return item.getRetireEffectiveAt().plus(hours, ChronoUnit.HOURS);
    }

    protected static Instant before(PlanRetirementItem item, long hours) {
        return item.getRetireEffectiveAt().minus(hours, ChronoUnit.HOURS);
    }

    /**
     * What Stripe's webhook does once the period ended and the subscription was cancelled: the mirror says canceled with a period end in the real past (the gates read the real
     * clock; the retirement job is driven with a simulated one).
     */
    protected void stripeEnded(Subscription s) {
        s.setStatus("canceled");
        s.setCurrentPeriodEnd(Instant.now().minus(1, ChronoUnit.HOURS));
        s.setCancelAtPeriodEnd(true);
        subscriptions.saveAndFlush(s);
    }

    /** The feature keys a plan version includes (BASE and INCLUDED components). */
    protected List<String> included(long versionId) {
        return db().queryForList("select feature_key from plan_component where plan_version_id = ? and role in ('BASE','INCLUDED') order by feature_key", String.class, versionId);
    }

    protected long freeVersionId() {
        return db().queryForObject("select v.id from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'FREE' and v.status = 'PUBLISHED'", Long.class);
    }
}
