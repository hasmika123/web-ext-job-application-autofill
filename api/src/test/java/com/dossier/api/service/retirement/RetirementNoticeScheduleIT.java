package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.catalog.CatalogException;
import com.dossier.api.service.retirement.dto.NoticeDTOs.NoticePage;
import com.dossier.api.service.retirement.dto.NoticeDTOs.NoticePreviewDTO;
import com.dossier.api.service.retirement.dto.NoticeDTOs.ResendResult;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CreateRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.StartRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.SuccessorRequest;
import jakarta.mail.internet.MimeMessage;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.3 on MySQL, driven by a clock (docs/subscriptions/11 section 4.1): exactly one notice per scheduled day per undecided subscriber, none after a decision, a rerun
 * sends nothing, the e-mail carries the date and the default-outcome sentence, nobody is written to who should not be, and the ledger says what was sent.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class RetirementNoticeScheduleIT {

    @Autowired private RecordingMailSender mail;

    @Autowired private RetirementService retirements;
    @Autowired private RetirementNoticeJob job;
    @Autowired private RetirementNoticeService notices;
    @Autowired private PlanRetirementItemRepository itemRepo;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;

    private SubFixtures.Plan plan;

    @BeforeEach
    void data() {
        plan = SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
        mail.reset();
    }

    private RetirementDTO started() {
        RetirementDTO d = retirements.create(new CreateRequest("PLAN", "TQ", null, null, null, null, null, null, null, null, RetirementFixtures.REASON, List.of()));
        return retirements.start(d.id(), new StartRequest(RetirementFixtures.REASON, "TQ"));
    }

    private Subscription yearly() {
        return RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "YEAR", "active", 200, false, false);
    }

    private PlanRetirementItem item(RetirementDTO r, Subscription s) {
        return itemRepo.findByRetirementIdAndSubscriptionId(r.id(), s.getId()).orElseThrow();
    }

    /** The subscriber chose: through the entity, because a JDBC update would leave this transaction's managed copy stale. */
    private void decide(PlanRetirementItem item, String status) {
        item.setStatus(status);
        item.setDecidedAt(Instant.now());
        itemRepo.saveAndFlush(item);
    }

    private int ledger(Long retirementId) {
        return jdbc.queryForObject("select count(*) from billing_notice where retirement_id = ? and status = 'SENT'", Integer.class, retirementId);
    }

    private List<String> subjects() {
        return mail.subjects();
    }

    @Test
    void oneNoticePerScheduledDayThenNoneAfterADecisionAndARerunIsANoOp() {
        Subscription s = yearly();
        RetirementDTO r = started();
        Instant effective = item(r, s).getRetireEffectiveAt();

        assertThat(job.run(effective.minus(61, ChronoUnit.DAYS))).as("further away than the first scheduled day").isZero();
        assertThat(job.run(effective.minus(59, ChronoUnit.DAYS))).as("the 60 day notice").isEqualTo(1);
        assertThat(job.run(effective.minus(59, ChronoUnit.DAYS))).as("a rerun the same day is a no-op").isZero();
        assertThat(job.run(effective.minus(58, ChronoUnit.DAYS))).as("nothing is due between two scheduled days").isZero();
        assertThat(job.run(effective.minus(30, ChronoUnit.DAYS))).as("the 30 day notice").isEqualTo(1);
        assertThat(ledger(r.id())).isEqualTo(2);
        assertThat(item(r, s).getLastNoticeDays()).isEqualTo(30);

        // a decision at day 20 stops the 7 and the 1
        decide(item(r, s), "SWITCH_SCHEDULED");
        assertThat(job.run(effective.minus(7, ChronoUnit.DAYS))).isZero();
        assertThat(job.run(effective.minus(1, ChronoUnit.DAYS))).isZero();
        assertThat(ledger(r.id())).isEqualTo(2);
        assertThat(jdbc.queryForList("select dedupe_key from billing_notice where retirement_id = ? order by id", String.class, r.id()))
            .containsExactly("RET:" + r.id() + ":" + s.getId() + ":60", "RET:" + r.id() + ":" + s.getId() + ":30");
    }

    @Test
    void anUndecidedSubscriberGetsAllFourAndTheLastOneSaysTodayIsTheLastDay() throws Exception {
        Subscription s = yearly();
        RetirementDTO r = started();
        Instant effective = item(r, s).getRetireEffectiveAt();
        for (int d : new int[] { 60, 30, 7, 1 }) assertThat(job.run(effective.minus(d, ChronoUnit.DAYS).plusSeconds(3600))).as("day " + d).isEqualTo(1);
        assertThat(ledger(r.id())).isEqualTo(4);
        assertThat(jdbc.queryForList("select kind from billing_notice where retirement_id = ? order by id", String.class, r.id()))
            .containsExactly("RETIREMENT_NOTICE_60", "RETIREMENT_NOTICE_30", "RETIREMENT_NOTICE_7", "RETIREMENT_NOTICE_1");
        assertThat(mail.sent).hasSize(4);
        assertThat(subjects()).allMatch(t -> t.startsWith("Your ") && t.contains(" plan is changing on "));
        assertThat(jdbc.queryForObject("select count(*) from notification where user_id = ? and kind = 'BILLING'", Integer.class, s.getUser().getId())).isEqualTo(4);
    }

    @Test
    void theEmailCarriesTheDateTheDefaultOutcomeAndTheGreenFrame() throws Exception {
        Subscription s = yearly();
        RetirementDTO r = started();
        Instant effective = item(r, s).getRetireEffectiveAt();
        job.run(effective.minus(1, ChronoUnit.DAYS).plusSeconds(3600));
        assertThat(mail.sent).hasSize(1);
        MimeMessage m = mail.sent.get(0);
        assertThat(m.getAllRecipients()[0].toString()).isEqualTo(s.getUser().getEmail());
        String body = (String) m.getContent();
        String date = java.time.format.DateTimeFormatter.ofPattern("MMMM d, yyyy", java.util.Locale.ENGLISH).withZone(java.time.ZoneOffset.UTC).format(effective);
        assertThat(body).contains(date).contains("If you do nothing, on " + date + " your account moves to Free").contains("Prefer to stop?").contains("Today is the last day to switch with no gap");
        assertThat(body).contains("#5cc21f").doesNotContain("#0b2a52"); // the personal green theme, not the enterprise blue
        assertThat(body).doesNotContain("unlimited").doesNotContain("refund");
    }

    @Test
    void theNoticeNamesTheClosestMatchWhenASuccessorIsRanked() throws Exception {
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        // a quarterly subscriber: TS is sold monthly and quarterly, and the advisor only suggests a plan that is sold at the subscriber's own interval (a yearly one gets no match)
        Subscription s = RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "QUARTER", "active", 200, false, false);
        RetirementDTO d = retirements.create(new CreateRequest("PLAN", "TQ", null, null, null, null, null, null, null, null, RetirementFixtures.REASON, List.of(new SuccessorRequest("TS", null, 1, null))));
        RetirementDTO r = retirements.start(d.id(), new StartRequest(RetirementFixtures.REASON, "TQ"));
        Instant effective = item(r, s).getRetireEffectiveAt();
        job.run(effective.minus(59, ChronoUnit.DAYS));
        assertThat(mail.sent).hasSize(1);
        assertThat((String) mail.sent.get(0).getContent()).contains("Successor plan is the closest match");
    }

    @Test
    void nobodyIsWrittenToWhoShouldNotBe() {
        Subscription noMail = yearly();
        noMail.getUser().setEmail(null);
        users.saveAndFlush(noMail.getUser());
        Subscription inactive = yearly();
        inactive.getUser().setActivated(false);
        users.saveAndFlush(inactive.getUser());
        Subscription fine = yearly();
        RetirementDTO r = started();
        Instant effective = itemRepo.findByRetirementIdOrderByIdAsc(r.id()).get(0).getRetireEffectiveAt();
        assertThat(job.run(effective.minus(59, ChronoUnit.DAYS))).as("only the reachable subscriber was written to").isEqualTo(1);
        assertThat(ledger(r.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from billing_notice where retirement_id = ? and status = 'SKIPPED'", Integer.class, r.id())).isEqualTo(2);
        assertThat(job.run(effective.minus(59, ChronoUnit.DAYS))).isZero();
        assertThat(mail.sent).hasSize(1);
        assertThat(fine.getUser().getEmail()).isNotBlank();
    }

    @Test
    void theLedgerIsReadableAndAResendNeedsAReasonAndAnUndecidedSubscriber() {
        Subscription s = yearly();
        RetirementDTO r = started();
        PlanRetirementItem item = item(r, s);
        Instant effective = item.getRetireEffectiveAt();
        job.run(effective.minus(59, ChronoUnit.DAYS));

        NoticePage page = notices.list(r.id(), 0, 20);
        assertThat(page.total()).isEqualTo(1);
        assertThat(page.items().get(0).login()).isEqualTo(s.getUser().getLogin());
        assertThat(page.items().get(0).kind()).isEqualTo("RETIREMENT_NOTICE_60");
        assertThat(page.items().get(0).channels()).isEqualTo("EMAIL,IN_APP");

        assertThatThrownBy(() -> notices.resend(r.id(), item.getId(), "no")).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("REASON_REQUIRED"));
        ResendResult res = notices.resend(r.id(), item.getId(), "The customer asked us to send it again");
        assertThat(res.sent()).isTrue();
        assertThat(ledger(r.id())).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from admin_audit_event where action = 'PLAN_RETIREMENT_NOTICE_RESENT'", Integer.class)).isEqualTo(1);

        decide(item, "CANCELLED");
        assertThatThrownBy(() -> notices.resend(r.id(), item.getId(), "The customer asked us to send it again")).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("NOT_PENDING"));
    }

    @Test
    void thePreviewRendersASampleOrARealSubscriber() {
        Subscription s = yearly();
        RetirementDTO r = started();
        NoticePreviewDTO sample = notices.preview(r.id(), null);
        assertThat(sample.sample()).isTrue();
        assertThat(sample.subject()).contains("Test plan is changing on");
        assertThat(sample.defaultOutcome()).contains("If you do nothing");
        NoticePreviewDTO real = notices.preview(r.id(), s.getId());
        assertThat(real.sample()).isFalse();
        assertThat(real.effectiveAt()).isEqualTo(item(r, s).getRetireEffectiveAt());
        assertThat(real.effectiveDate()).isNotBlank();
    }
}
