package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunityDemoSeeder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * ONE record per consultant answer, end to end on the real stack: a marketer saves a job for a consultant (the extension's "Save for consultant"), the
 * consultant answers on the live Assigned Opportunities page ({@code /me-workspace/opportunities}), and the marketer's Opportunities board
 * ({@code /mkt/opportunities}: the row, its timeline and activity feed, {@code answer-info}) sees exactly that answer. The marketer's answer to a question
 * comes back on the consultant's detail. A job saved from the extension has no {@code cws_job_source} row: the page shows the job's own link. Nothing here
 * applies or submits for anyone, and another organization's or another consultant's caller gets the generic 404 on every route.
 *
 * <p>Not {@code @Transactional}: the job insert is a transaction of its own ({@code REQUIRES_NEW}), so the test cleans up what it created.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false", "spring.datasource.hikari.maximum-pool-size=4" })
@org.junit.jupiter.api.Timeout(240)
class ConsultantAnswerReachesMarketerIT {

    private static final String MARKETER = "demo-ent-acme-sarah"; // Org Admin + Marketing Manager: ORG scope (sees and answers for every consultant)
    private static final String CONSULTANT = "demo-ent-acme-anika";
    private static final String OTHER_CONSULTANT = "demo-ent-acme-ben";
    private static final String BETA_OWNER = "demo-ent-beta-bea";

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private MktOpportunityDemoSeeder oppSeeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private OrganizationRepository orgs;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private org.springframework.transaction.PlatformTransactionManager txManager;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;

    private Long acme;
    private Long anika;
    private final List<Long> createdJobs = new ArrayList<>();
    private String link;
    private long jobId;
    private long matchId;

    @BeforeEach
    @org.junit.jupiter.api.Timeout(240)
    void seed() throws Exception {
        assertThat(baseSeeder.seed().ran()).isTrue();
        assertThat(talentSeeder.seed().ran()).isTrue();
        oppSeeder.seed();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).map(Organization::getId).orElseThrow();
        anika = jdbc.queryForObject(
            "select c.id from consultant_profile c join org_member m on m.org_id = c.org_id and m.id = c.member_id join jhi_user u on u.id = m.user_id where c.org_id = ? and u.login = ?",
            Long.class, acme, CONSULTANT
        );
        link = "https://boards.greenhouse.io/it-" + UUID.randomUUID() + "/jobs/4012345";
        // the marketer saves a trimmed job for the consultant, exactly as the extension does
        MvcResult r = mockMvc.perform(
            post("/api/orgs/" + acme + "/mkt/opportunities/from-extension")
                .with(user(MARKETER))
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of(
                    "jobUrl", link, "title", "Pipeline Test Engineer", "company", "Acme Integration Test Corp", "location", "Austin, TX", "payLabel", "$70-80/hr",
                    "atsPlatform", "greenhouse", "externalJobId", UUID.randomUUID().toString().substring(0, 8), "keyInfo", "Lead with the payments work.",
                    "consultantIds", List.of(anika), "extensionVersion", "1.4.2"
                )))
        ).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        jobId = om.readTree(r.getResponse().getContentAsString()).path("jobId").asLong();
        createdJobs.add(jobId);
        matchId = jdbc.queryForObject("select id from requirement_match where org_id = ? and requirement_id = ? and consultant_id = ?", Long.class, acme, jobId, anika);
    }

    @AfterEach
    void cleanUp() {
        new org.springframework.transaction.support.TransactionTemplate(txManager).executeWithoutResult(status -> {
            for (Long job : createdJobs) {
                jdbc.update("delete from pipeline_application_link where opportunity_id in (select o.id from mkt_opportunity o join requirement_match m on m.org_id = o.org_id and m.id = o.match_id where m.requirement_id = ?)", job);
                jdbc.update("delete from mkt_opportunity_event where opportunity_id in (select o.id from mkt_opportunity o join requirement_match m on m.org_id = o.org_id and m.id = o.match_id where m.requirement_id = ?)", job);
                jdbc.update("delete from mkt_opportunity where match_id in (select id from requirement_match where requirement_id = ?)", job);
                jdbc.update("delete from cws_match_interest where requirement_id = ?", job);
                jdbc.update("delete from cws_opportunity_response where requirement_id = ?", job);
                jdbc.update("delete from requirement_match where requirement_id = ?", job);
                jdbc.update("delete from requirement_skill where requirement_id = ?", job);
                jdbc.update("delete from job_data_event where requirement_id = ?", job);
                jdbc.update("delete from client_requirement where id = ?", job);
            }
            jdbc.update("delete from idempotency_record where org_id = ?", acme);
        });
        settings.invalidate();
        resolver.invalidate();
    }

    // ---- calls --------------------------------------------------------------------------------------------------------------

    private JsonNode call(MockHttpServletRequestBuilder req, String login, String body, int expected) throws Exception {
        if (body != null) req = req.contentType(MediaType.APPLICATION_JSON).content(body);
        MvcResult r = mockMvc.perform(req.with(user(login))).andReturn();
        String text = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(r.getRequest().getMethod() + " " + r.getRequest().getRequestURI() + " -> " + text).isEqualTo(expected);
        return text.isBlank() || expected >= 400 ? om.nullNode() : om.readTree(text);
    }

    private JsonNode consultantRow() throws Exception {
        for (JsonNode n : call(get("/api/orgs/" + acme + "/me-workspace/opportunities?size=50"), CONSULTANT, null, 200).path("rows")) if (n.path("matchId").asLong() == matchId) return n;
        throw new AssertionError("the consultant's page has no row for match " + matchId);
    }

    private JsonNode consultantDetail() throws Exception {
        return call(get("/api/orgs/" + acme + "/me-workspace/opportunities/" + matchId), CONSULTANT, null, 200);
    }

    private JsonNode consultantAct(String action, String body) throws Exception {
        return call(post("/api/orgs/" + acme + "/me-workspace/opportunities/" + matchId + "/" + action), CONSULTANT, body, 200);
    }

    /** The marketer's Opportunities board row and timeline of the match (the board's id is the match id). */
    private JsonNode boardDetail() throws Exception {
        return call(get("/api/orgs/" + acme + "/mkt/opportunities/" + matchId), MARKETER, null, 200);
    }

    private static List<String> texts(JsonNode array, String field) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : array) out.add(n.path(field).asText());
        return out;
    }

    // ---- the answers reach the marketer ---------------------------------------------------------------------------------------

    @Test
    void aJobSavedFromTheExtensionShowsAnOpenLinkAndExpressInterestReachesTheBoardAndTheFeed() throws Exception {
        JsonNode before = consultantRow();
        assertThat(before.path("sourceUrl").asText()).as("no cws_job_source row: the job's own link").isEqualTo(link);
        assertThat(before.path("status").asText()).isEqualTo("NEW");
        assertThat(boardDetail().path("item").path("interest").asText()).isEqualTo("NO_RESPONSE");

        JsonNode out = consultantAct("express-interest", null);
        assertThat(out.path("interestSent").asBoolean()).isTrue();

        JsonNode board = boardDetail();
        assertThat(board.path("item").path("interest").asText()).as("the marketer's board reads the consultant's answer").isEqualTo("INTERESTED");
        assertThat(texts(board.path("events"), "text")).contains("is interested");
        JsonNode list = call(get("/api/orgs/" + acme + "/mkt/opportunities?days=0&size=100"), MARKETER, null, 200);
        assertThat(texts(list.path("activity"), "text")).as("the activity feed").contains("is interested");
        boolean seen = false;
        for (JsonNode item : list.path("items")) if (item.path("id").asLong() == matchId) seen = "INTERESTED".equals(item.path("interest").asText());
        assertThat(seen).isTrue();
        assertThat(consultantRow().path("status").asText()).isEqualTo("NEW");
        assertThat(consultantRow().path("interestSent").asBoolean()).isTrue();
    }

    @Test
    void aQuestionReachesTheMarketerWhoAnswersItAndTheConsultantReadsTheAnswer() throws Exception {
        String answerPath = "/api/orgs/" + acme + "/mkt/opportunities/" + matchId + "/answer-info";
        MvcResult noQuestion = mockMvc.perform(post(answerPath).with(user(MARKETER)).contentType(MediaType.APPLICATION_JSON).content("{\"answer\":\"Too early to answer anything.\"}")).andReturn();
        assertThat(noQuestion.getResponse().getStatus()).isEqualTo(409);
        assertThat(noQuestion.getResponse().getContentAsString()).contains("NO_OPEN_INFO_REQUEST");

        String question = "Is this role fully remote? (" + System.nanoTime() + ")";
        assertThat(consultantAct("need-more-info", "{\"message\":\"" + question + "\"}").path("status").asText()).isEqualTo("AWAITING_RESPONSE");
        JsonNode asked = boardDetail();
        assertThat(texts(asked.path("events"), "text")).contains("asked a question");
        assertThat(texts(call(get("/api/orgs/" + acme + "/mkt/opportunities?days=0&size=100"), MARKETER, null, 200).path("activity"), "text")).contains("asked a question");

        String answer = "Yes, fully remote within the US. Hours overlap Central time.";
        call(post(answerPath), MARKETER, "{\"answer\":\"" + answer + "\"}", 200);
        assertThat(texts(boardDetail().path("events"), "text")).contains("answered the consultant's question");

        JsonNode detail = consultantDetail();
        assertThat(detail.path("infoRequest").asText()).isEqualTo(question);
        assertThat(detail.path("infoAnswer").asText()).as("the page shows the marketer's answer").isEqualTo(answer);
        assertThat(detail.path("row").path("infoAnswered").asBoolean()).isTrue();
        assertThat(texts(detail.path("timeline"), "key")).contains("INFO_REQUEST", "INFO_ANSWER");
        assertThat(detail.path("row").path("status").asText()).as("only the consultant moves it on").isEqualTo("AWAITING_RESPONSE");
        // ...which they do: interested after the answer
        assertThat(consultantAct("express-interest", null).path("interestSent").asBoolean()).isTrue();
        assertThat(boardDetail().path("item").path("interest").asText()).isEqualTo("INTERESTED");
    }

    @Test
    void declineAndReopenReachTheBoard() throws Exception {
        assertThat(consultantAct("decline", "{\"reason\":\"Pay is below my minimum rate.\"}").path("status").asText()).isEqualTo("DECLINED");
        JsonNode board = boardDetail();
        assertThat(board.path("item").path("interest").asText()).isEqualTo("NOT_INTERESTED");
        assertThat(board.path("item").path("action").asText()).isEqualTo("COMPARE");
        assertThat(texts(board.path("events"), "text")).anyMatch(t -> t.startsWith("declined") && t.contains("Pay is below my minimum rate."));
        assertThat(consultantDetail().path("declineReason").asText()).isEqualTo("Pay is below my minimum rate.");

        assertThat(consultantAct("reopen", null).path("status").asText()).isEqualTo("NEW");
        JsonNode reopened = boardDetail();
        assertThat(reopened.path("item").path("interest").asText()).isEqualTo("NO_RESPONSE");
        assertThat(texts(reopened.path("events"), "kind")).contains("REOPENED");
    }

    @Test
    void iAppliedIsTheConsultantsOwnStatementTheMarketerReadsAndNothingIsSubmitted() throws Exception {
        long applicationsBefore = jdbc.queryForObject("select count(*) from talent_application where org_id = ?", Long.class, acme);
        assertThat(consultantAct("applied", null).path("status").asText()).isEqualTo("APPLIED");
        JsonNode board = boardDetail();
        assertThat(texts(board.path("events"), "text")).anyMatch(t -> t.contains("says they applied"));
        assertThat(jdbc.queryForObject("select state from mkt_opportunity where org_id = ? and match_id = ?", String.class, acme, matchId)).isEqualTo("APPLIED");
        assertThat(jdbc.queryForObject("select count(*) from talent_application where org_id = ?", Long.class, acme)).as("no application is created or submitted").isEqualTo(applicationsBefore);
        assertThat(consultantRow().path("allowedActions")).isEmpty();
    }

    // ---- the tenant wall ---------------------------------------------------------------------------------------------------

    @Test
    void anotherConsultantAndAnotherOrganizationGetTheGenericNotFoundOnEveryRoute() throws Exception {
        consultantAct("express-interest", null); // the record exists, so a leak would show
        String ws = "/api/orgs/" + acme + "/me-workspace/opportunities/" + matchId;
        for (String login : List.of(OTHER_CONSULTANT, BETA_OWNER)) {
            call(get(ws), login, null, 404);
            for (String action : List.of("express-interest", "need-more-info", "decline", "reopen", "applied")) call(post(ws + "/" + action), login, "{\"message\":\"Please tell me more\",\"reason\":\"Not for me\"}", 404);
        }
        // another organization's marketer: the board, its timeline and answer-info are the same generic 404
        call(get("/api/orgs/" + acme + "/mkt/opportunities/" + matchId), BETA_OWNER, null, 404);
        call(post("/api/orgs/" + acme + "/mkt/opportunities/" + matchId + "/answer-info"), BETA_OWNER, "{\"answer\":\"Hello there\"}", 404);
        assertThat(jdbc.queryForObject("select state from mkt_opportunity where org_id = ? and match_id = ?", String.class, acme, matchId)).isEqualTo("INTERESTED");
        assertThat(jdbc.queryForObject("select count(*) from mkt_opportunity_event e join mkt_opportunity o on o.org_id = e.org_id and o.id = e.opportunity_id where o.match_id = ? and e.kind = 'INTERESTED'", Long.class, matchId)).isEqualTo(1L);
    }
}
