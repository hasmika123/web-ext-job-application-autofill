package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.IntegrationTest;
import com.dossier.api.TestInboxKey;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.Interview;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.repository.InterviewRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.BillingDemoSeeder;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantInboxDemoSeeder;
import com.dossier.api.service.inbox.DemoImapGateway;
import com.dossier.api.service.inbox.ImapGateway;
import com.dossier.api.service.inbox.ExtractedSchedule;
import com.dossier.api.service.inbox.InboxInterviewApplier;
import com.dossier.api.service.inbox.InboxMailService;
import com.dossier.api.service.inbox.InboxReviewService;
import com.dossier.api.service.inbox.InboxService;
import com.dossier.api.service.inbox.InboxSyncService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The demo stack's sample mailbox end to end (ent-inbox): with the demo switches on the sandbox gateway IS the gateway (the bean wires), the seeder puts the
 * add-on on Anika's license and not Ben's, and Anika "connects a Gmail" with the fixed demo address and any 16 letters, the real sync reads the sample mail,
 * the real parser moves her applications and offers new ones, and her Inbox page shows it. Nothing here touches a real mailbox.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(3000)
class ConsultantInboxDemoIT {

    private static final String ANIKA = "demo-ent-acme-anika";
    private static final String BEN = "demo-ent-acme-ben";
    private static final String CODE = "abcdefghijklmnop";

    @DynamicPropertySource
    static void key(DynamicPropertyRegistry r) {
        r.add("dossier.inbox.key", () -> TestInboxKey.VALUE);
    }

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private BillingDemoSeeder billingSeeder;
    @Autowired private ConsultantInboxDemoSeeder inboxSeeder;
    @Autowired private ImapGateway imap;
    @Autowired private InboxService inbox;
    @Autowired private InboxSyncService sync;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private ApplicationRepository applications;
    @Autowired private InboxConnectionRepository connections;
    @Autowired private InboxMessageRepository messages;
    @Autowired private InterviewRepository interviews;
    @Autowired private InboxMailService mail;
    @Autowired private InboxReviewService review;
    @Autowired private InboxInterviewApplier applier;
    @Autowired private ResumeBuilderSettings settings;

    private Long acme;

    /** One seeding for the whole class (the base + talent + billing seed takes minutes), then every check in order. */
    @Test
    void theSampleMailboxEndToEnd() throws Exception {
        try {
            assertThat(baseSeeder.seed().ran()).isTrue();
            assertThat(talentSeeder.seed().ran()).isTrue();
            assertThat(billingSeeder.seed().ran()).isTrue();
            acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).map(Organization::getId).orElseThrow();

            theSandboxIsTheGateway();
            theSeederPutsTheAddOnOnAnikaAndNotBen();
            aSecondSeedAddsNothing();
            aWrongCodeIsRefusedCalmly();
            anikaConnectsAndTheRealSyncMovesHerApplications();
            theInterviewMailsSetTheInterviewsAndAcceptingHarborAddsItsInterview();
            benSeesNoneOfIt();
            disconnectForgetsEverything();
        } finally {
            SecurityContextHolder.clearContext();
            settings.invalidate();
        }
    }

    private void as(String login) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(login, "x"));
    }

    private Long id(String login) {
        return users.findOneByLogin(login).orElseThrow().getId();
    }

    private JsonNode page(String login) throws Exception {
        MvcResult r = mockMvc.perform(get("/api/orgs/" + acme + "/me-workspace/inbox").with(user(login))).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return om.readTree(r.getResponse().getContentAsString());
    }

    private void theSandboxIsTheGateway() {
        assertThat(imap).as("with the demo on, the sample mailbox replaces Gmail").isInstanceOf(DemoImapGateway.class);
        assertThat(imap.isDemoSandbox()).isTrue();
        assertThat(imap.sandboxAddress()).endsWith("@gmail.com");
    }

    private void theSeederPutsTheAddOnOnAnikaAndNotBen() throws Exception {
        inboxSeeder.seed();
        assertThat(page(ANIKA).path("inbox").path("entitled").asBoolean()).as("Anika's license carries inbox.monitoring").isTrue();
        assertThat(page(BEN).path("inbox").path("entitled").asBoolean()).as("Ben's does not").isFalse();
        List<Application> mine = applications.findByUserId(id(ANIKA));
        assertThat(mine).extracting(Application::getCompany).contains("Orbit Freight", "Cedar Analytics");
        assertThat(mine).filteredOn(a -> a.getCompany().equals("Orbit Freight")).first().satisfies(a -> assertThat(a.getStatus()).isEqualTo(ApplicationStatus.APPLIED));
    }

    private void aSecondSeedAddsNothing() {
        assertThat(inboxSeeder.seed()).isZero();
    }

    private void aWrongCodeIsRefusedCalmly() {
        as(ANIKA);
        var bad = inbox.connect(imap.sandboxAddress(), "zzzzabcdefghijkl", acme);
        assertThat(bad.refusal().code()).isEqualTo("BAD_CREDENTIALS");
        assertThat(inbox.connect("someone.else@gmail.com", CODE, acme).refusal().code()).as("only the demo address exists").isEqualTo("BAD_CREDENTIALS");
        assertThat(connections.findById(id(ANIKA))).isEmpty();
    }

    private void anikaConnectsAndTheRealSyncMovesHerApplications() throws Exception {
        as(ANIKA);
        var ok = inbox.connect(imap.sandboxAddress(), CODE, acme);
        assertThat(ok.refusal()).isNull();
        assertThat(connections.findById(id(ANIKA)).orElseThrow().getConnectedViaOrgId()).isEqualTo(acme);

        assertThat(sync.sync(id(ANIKA))).isEqualTo(InboxSyncService.Result.OK);

        List<Application> apps = applications.findByUserId(id(ANIKA));
        assertThat(apps).filteredOn(a -> a.getCompany().equals("Orbit Freight")).first().satisfies(a -> assertThat(a.getStatus()).as("the interview invite").isEqualTo(ApplicationStatus.INTERVIEW));
        // A rejection is never applied on its own (inbox-safety): it waits for Anika, who confirms it.
        assertThat(apps).filteredOn(a -> a.getCompany().equals("Cedar Analytics")).first().satisfies(a -> assertThat(a.getStatus()).as("the rejection is held").isNotEqualTo(ApplicationStatus.REJECTED));
        InboxReviewService.Item held = review.list(id(ANIKA)).items().stream().filter(i -> "Cedar Analytics".equals(i.company())).findFirst().orElseThrow();
        assertThat(held.kind()).isEqualTo("REJECTION");
        assertThat(review.accept(id(ANIKA), held.id(), null).application().status()).isEqualTo("REJECTED");
        apps = applications.findByUserId(id(ANIKA));
        assertThat(apps).filteredOn(a -> a.getCompany().equals("Cedar Analytics")).first().satisfies(a -> assertThat(a.getStatus()).as("the rejection, confirmed").isEqualTo(ApplicationStatus.REJECTED));

        List<InboxMessage> all = messages.findByUserIdOrderBySentAtDesc(id(ANIKA));
        assertThat(all).as("the original seven mails plus three interview mails (a phone screen, its reschedule and a calendar invitation) plus four Northwind Labs mails").hasSize(14);
        assertThat(all).filteredOn(m -> "Ten long articles for the weekend".equals(m.getSubject())).first().satisfies(m -> assertThat(m.getBodyText()).as("not job mail: headers only").isNull());
        assertThat(all).filteredOn(m -> "NEW".equals(m.getSuggestion())).extracting(InboxMessage::getCompanyGuess).as("Harbor Cloud has two mails now: the availability request and the confirmed invitation").containsExactlyInAnyOrder("Lumen Health", "Harbor Cloud", "Harbor Cloud");

        JsonNode p = page(ANIKA);
        assertThat(p.path("inbox").path("connected").asBoolean()).isTrue();
        assertThat(p.path("inbox").path("sandbox").asBoolean()).isTrue();
        assertThat(p.path("suggestions")).as("one row per company, the newest mail").hasSize(2);
        assertThat(p.path("updates")).extracting(n -> n.path("company").asText() + ":" + n.path("stage").asText()).contains("Orbit Freight:INTERVIEW", "Cedar Analytics:REJECTED");
        assertThat(p.path("updates")).allSatisfy(n -> assertThat(n.path("source").asText()).isEqualTo("INBOX"));
        assertThat(p.toString()).doesNotContain(CODE).doesNotContain("passwordEnc");
    }

    private void theInterviewMailsSetTheInterviewsAndAcceptingHarborAddsItsInterview() {
        ZoneId la = ZoneId.of("America/Los_Angeles");
        LocalDate today = LocalDate.now(ZoneOffset.UTC);

        // Orbit Freight: the phone screen was read from the text, then moved by the reschedule mail (same row, earlier time kept)
        Application orbit = applications.findByUserId(id(ANIKA)).stream().filter(a -> a.getCompany().equals("Orbit Freight")).findFirst().orElseThrow();
        List<Interview> orbitInterviews = interviews.findByApplicationIdAndUserIdOrderByStartsAtDescIdDesc(orbit.getId(), id(ANIKA));
        assertThat(orbitInterviews).as("one interview, moved, not two").hasSize(1);
        Interview phone = orbitInterviews.get(0);
        assertThat(phone.getSource()).isEqualTo(Interview.SRC_INBOX);
        assertThat(phone.getKind()).isEqualTo("PHONE");
        assertThat(phone.getTz()).isEqualTo("America/Los_Angeles");
        assertThat(phone.getStartsAt()).isEqualTo(LocalDateTime.of(today.plusDays(11), java.time.LocalTime.of(15, 30)).atZone(la).toInstant());
        assertThat(phone.getScheduleHistory()).isEqualTo(LocalDateTime.of(today.plusDays(9), java.time.LocalTime.of(14, 0)).atZone(la).toInstant().toString());
        assertThat(phone.getEndsAt()).isEqualTo(phone.getStartsAt().plusSeconds(30 * 60));
        assertThat(phone.getOutcome()).isEqualTo(Interview.PENDING);

        // Harbor Cloud is not tracked yet: accepting the suggestion puts the calendar invitation's time on the new application
        as(ANIKA);
        InboxMessage invite = messages.findByUserIdOrderBySentAtDesc(id(ANIKA)).stream().filter(m -> "NEW".equals(m.getSuggestion()) && "Harbor Cloud".equals(m.getCompanyGuess())).findFirst().orElseThrow();
        Long harborMail = invite.getId();
        assertThat(invite.getSubject()).as("the newest Harbor Cloud mail is the calendar invitation").startsWith("Interview confirmed");
        assertThat(invite.getCategory()).isEqualTo("INTERVIEW");
        assertThat(invite.getCalendarEvent()).as("the calendar part was reduced to a few fields at sync, never kept whole").isNotBlank().doesNotContain("BEGIN:VCALENDAR");
        ExtractedSchedule read = applier.read(invite);
        assertThat(read.scheduled()).as("read: %s", read).isTrue();
        Long harborId = mail.accept(harborMail, null, "Site Reliability Engineer");
        List<Interview> harbor = interviews.findByApplicationIdAndUserIdOrderByStartsAtDescIdDesc(harborId, id(ANIKA));
        assertThat(harbor).hasSize(1);
        Interview ics = harbor.get(0);
        assertThat(ics.getStartsAt()).isEqualTo(LocalDateTime.of(today.plusDays(7), java.time.LocalTime.of(10, 0)).atZone(la).toInstant());
        assertThat(ics.getEndsAt()).isEqualTo(ics.getStartsAt().plusSeconds(45 * 60));
        assertThat(ics.getExternalUid()).isEqualTo("harbor-sre-0001@harborcloud.example");
        assertThat(ics.getNotes()).isEqualTo("Meeting link: https://harborcloud.zoom.us/j/84217650931");
        assertThat(applications.findById(harborId).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.INTERVIEW);
    }

    private void benSeesNoneOfIt() throws Exception {
        JsonNode p = page(BEN);
        assertThat(p.path("inbox").path("connected").asBoolean()).isFalse();
        assertThat(p.path("suggestions")).isEmpty();
        assertThat(p.path("updates")).isEmpty();
    }

    private void disconnectForgetsEverything() {
        as(ANIKA);
        inbox.disconnect();
        assertThat(connections.findById(id(ANIKA))).isEmpty();
        assertThat(messages.countByUserId(id(ANIKA))).isZero();
    }
}
