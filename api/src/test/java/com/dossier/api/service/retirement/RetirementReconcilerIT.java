package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.BillingDrift;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.repository.sub.BillingDriftRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.8 (docs/subscriptions/11 section 9): the nightly reconciler records what is wrong as {@code billing_drift kind=RETIREMENT} and never fixes it. The conditions it can see
 * from Kiwiply's own records: Stripe never told to end the old plan close to the date, a date that passed without the item being applied, a subscriber who fell back while the
 * mirror still shows an active, not-ending subscription. A row resolves itself when the condition is gone.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class RetirementReconcilerIT extends RetirementItSupport {

    @Autowired private RetirementReconciler reconciler;
    @Autowired private BillingDriftRepository drifts;

    private List<String> openCodes() {
        em.flush();
        return drifts.findOpen(RetirementReconciler.KIND).stream().map(BillingDrift::getCode).toList();
    }

    @Test
    void aMissedCancelLeadIsReportedThenResolvedOnceItIsDone() {
        Subscription s = monthly(40);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);

        var found = reconciler.run(before(item, 10));
        assertThat(found.opened()).isEqualTo(1);
        assertThat(openCodes()).containsExactly("CANCEL_NOT_SET");
        assertThat(drifts.findOpen("RETIREMENT").get(0).getSubject()).isEqualTo("item:" + item.getId());
        assertThat(reconciler.run(before(item, 9)).opened()).as("the same condition is the same row").isZero();

        job.run(before(item, 10)); // the D-1 pass finally runs
        var again = reconciler.run(before(item, 9));
        assertThat(again.resolved()).isEqualTo(1);
        assertThat(openCodes()).isEmpty();
        assertThat(drifts.findOpen("RETIREMENT")).isEmpty();
        assertThat(stripe.itemCalls).as("the reconciler never writes money").isEmpty();
        assertThat(stripe.invoiceItemCalls).isEmpty();
    }

    @Test
    void anItemWhoseDatePassedWithoutBeingAppliedIsReportedAndResolvedByTheJob() {
        Subscription s = monthly(40);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);
        reconciler.run(before(item, 30)); // nothing yet
        assertThat(openCodes()).isEmpty();
        assertThat(reconciler.run(after(item, 3)).opened()).isGreaterThanOrEqualTo(1);
        assertThat(openCodes()).contains("NOT_APPLIED");
        job.run(after(item, 3));
        reconciler.run(after(item, 4));
        assertThat(openCodes()).doesNotContain("NOT_APPLIED");
    }

    @Test
    void aFallenBackSubscriberWhoseMirrorStillBillsIsReportedUntilTheWebhookCatchesUp() {
        Subscription s = monthly(40);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);
        job.run(after(item, 1));
        reconciler.run(after(item, 24));
        assertThat(openCodes()).as("not yet two days").doesNotContain("STILL_BILLING");
        reconciler.run(after(item, 72));
        assertThat(openCodes()).contains("STILL_BILLING");
        stripeEnded(s); // the webhook arrives
        reconciler.run(after(item, 73));
        assertThat(openCodes()).doesNotContain("STILL_BILLING");
    }

    @Test
    void aScheduledSwitchWithNoScheduleReferenceIsReported() {
        Subscription s = monthly(40);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);
        item.setStatus("SWITCH_SCHEDULED");
        item.setStripeRef(null);
        itemRepo.saveAndFlush(item);
        reconciler.run(before(item, 30));
        assertThat(openCodes()).contains("SCHEDULE_MISSING");
    }
}
