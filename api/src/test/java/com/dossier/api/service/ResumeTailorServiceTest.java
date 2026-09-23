package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeTailor;
import com.dossier.api.domain.User;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.ResumeTailorRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.AiBudgetService.Decision;
import com.dossier.api.service.AiBudgetService.Verdict;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import com.dossier.api.service.dto.ResumeDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

/**
 * Resume tailoring (Phase 13.4): the truthfulness checks the server enforces, and that saving builds
 * a NEW resume from the checked proposal — never from client text, never onto a changed resume.
 */
class ResumeTailorServiceTest {

    private static final String MODEL = "gemini-2.5-flash-lite";
    private static final Instant RESET = Instant.parse("2026-10-01T00:00:00Z");
    private static final String JD =
        "Senior backend engineer at Acme. Build distributed Java services on Spring Boot and Kafka, own PostgreSQL " +
        "schemas, run production on AWS with Terraform. Mentor engineers and partner with product on payments.";
    private static final String RESUME_JSON =
        "{\"summary\":\"Backend engineer with 6 years in Java.\",\"skills\":[\"Python\",\"Java\",\"Kafka\",\"Docker\"]," +
        "\"experience\":[{\"company\":\"Globex\",\"title\":\"Engineer\",\"startDate\":\"2020\",\"endDate\":\"2024\"," +
        "\"bullets\":[\"Built event pipelines handling 1,200 requests per second\",\"Led a team of 4 engineers\",\"Wrote docs\"]}]," +
        "\"education\":[{\"school\":\"State U\",\"degree\":\"BS\",\"field\":\"CS\"}]}";

    private final ObjectMapper om = new ObjectMapper();
    private AiProvider provider;
    private AiBudgetService budget;
    private AiMeteringService metering;
    private ResumeRepository resumes;
    private ApplicationRepository applications;
    private ResumeTailorRepository tailors;
    private ProfileService profile;
    private ResumeTailorService service;
    private User user;
    private Resume resume;
    private Application app;

    @BeforeEach
    void setUp() {
        provider = Mockito.mock(AiProvider.class);
        when(provider.isConfigured()).thenReturn(true);
        budget = Mockito.mock(AiBudgetService.class);
        when(budget.decide(anyString(), any())).thenReturn(new Decision(Verdict.OK, MODEL, true, 10, 100, RESET, false));
        metering = Mockito.mock(AiMeteringService.class);
        resumes = Mockito.mock(ResumeRepository.class);
        applications = Mockito.mock(ApplicationRepository.class);
        tailors = Mockito.mock(ResumeTailorRepository.class);
        when(tailors.save(any())).thenAnswer(inv -> inv.getArgument(0));
        profile = Mockito.mock(ProfileService.class);
        UserRepository users = Mockito.mock(UserRepository.class);
        user = new User();
        user.setId(7L);
        user.setLogin("user");
        when(users.findOneByLogin("user")).thenReturn(Optional.of(user));

        resume = new Resume().label("Backend v3").parsedJson(RESUME_JSON).archived(false).createdAt(Instant.now());
        resume.setId(11L);
        resume.setUser(user);
        when(resumes.findById(11L)).thenReturn(Optional.of(resume));
        app = new Application();
        app.setId(5L);
        app.setUser(user);
        app.setJobDescription(JD);
        app.setRoleTitle("Backend Engineer");
        app.setCompany("Acme");
        when(applications.findById(5L)).thenReturn(Optional.of(app));

        service = new ResumeTailorService(provider, budget, metering, resumes, applications, tailors, users, profile, true);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("user", "x"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private JsonNode parsed() throws Exception {
        return om.readTree(RESUME_JSON);
    }

    private ObjectNode check(String reply) throws Exception {
        JsonNode p = parsed();
        return service.check(reply, p, ResumeTailorService.bulletsByRef(p), "Acme");
    }

    // ---- the truthfulness checks -------------------------------------------------------------

    @Test
    void anInventedNumberIsDropped() throws Exception {
        ObjectNode out = check(
            "{\"bullets\":[" +
            "{\"ref\":\"e0b0\",\"text\":\"Built Kafka event pipelines handling 1200 requests per second\"}," + // same number, reformatted
            "{\"ref\":\"e0b1\",\"text\":\"Led a team of 12 engineers, cutting costs 40%\"}]}" // invented
        );
        assertThat(out.path("bullets")).hasSize(1);
        assertThat(out.path("bullets").get(0).path("ref").asText()).isEqualTo("e0b0");
    }

    @Test
    void onlyExistingBulletsCanBeRewrittenOnce() throws Exception {
        ObjectNode out = check(
            "{\"bullets\":[{\"ref\":\"e9b0\",\"text\":\"Worked at Initech\"},{\"ref\":\"e0b2\",\"text\":\"Wrote design docs\"}," +
            "{\"ref\":\"e0b2\",\"text\":\"Wrote runbooks\"},{\"ref\":\"e0b2\",\"text\":\"Wrote docs\"}]}"
        );
        assertThat(out.path("bullets")).hasSize(1);
        assertThat(out.path("bullets").get(0).path("text").asText()).isEqualTo("Wrote design docs");
    }

    @Test
    void namingTheHiringCompanyIsDropped() throws Exception {
        assertThat(check("{\"bullets\":[{\"ref\":\"e0b2\",\"text\":\"Wrote docs, ready to do the same at Acme\"}]}").path("bullets")).isEmpty();
    }

    @Test
    void theSummaryFollowsTheSameRules() throws Exception {
        assertThat(check("{\"bullets\":[],\"summary\":\"Backend engineer with 6 years building Java and Kafka services.\"}").path("summary").asText())
            .contains("Kafka");
        assertThat(check("{\"bullets\":[],\"summary\":\"Backend engineer with 10 years in Java.\"}").has("summary")).as("10 isn't on the resume").isFalse();
    }

    @Test
    void skillsAreOnlyReorderedNeverAdded() throws Exception {
        ObjectNode out = check("{\"bullets\":[],\"skillsOrder\":[\"kafka\",\"Java\",\"Terraform\",\"Kafka\"],\"suggestions\":[\"Terraform\",\"java\",\"PostgreSQL\"]}");
        List<String> order = om.convertValue(out.path("skillsOrder"), List.class);
        assertThat(order).containsExactly("Kafka", "Java", "Python", "Docker");
        List<String> sug = om.convertValue(out.path("suggestions"), List.class);
        assertThat(sug).as("suggested, never applied; not ones already listed").containsExactly("Terraform", "PostgreSQL");
    }

    @Test
    void numbersAreComparedNormalized() {
        assertThat(ResumeTailorService.numbers("1,200 rps across 3 regions")).containsExactly("1200", "3");
        assertThat(ResumeTailorService.acceptable("Handled 1,200 rps", "Scaled to 1200 rps", "Handled 1,200 rps", "")).isTrue();
    }

    // ---- propose -----------------------------------------------------------------------------

    @Test
    void itIsPro() {
        when(budget.decide(anyString(), any())).thenReturn(new Decision(Verdict.PRO_REQUIRED, null, false, 0, 0, RESET, false));
        assertThatThrownBy(() -> service.proposeForApplication(5L, 11L, true)).isInstanceOf(ProRequiredException.class);
    }

    @Test
    void aProposalIsCheckedStoredAndPresentedAsBeforeAndAfter() {
        when(provider.generate(eq(AiTask.TAILOR), any(), anyString(), anyString())).thenReturn(
            new AiResult(
                "{\"bullets\":[{\"ref\":\"e0b2\",\"text\":\"Wrote design docs for Kafka services\"},{\"ref\":\"e0b1\",\"text\":\"Led 9 engineers\"}]," +
                "\"skillsOrder\":[\"Kafka\",\"Java\"]}",
                MODEL,
                3000,
                0,
                400
            )
        );
        ResumeTailorService.Result r = service.proposeForApplication(5L, 11L, true);
        assertThat(r.status()).isEqualTo(ResumeTailorService.Status.OK);
        assertThat(r.proposal().changes()).extracting(ResumeTailorService.Change::ref).containsExactly("e0b2", "skills");
        ResumeTailorService.Change bullet = r.proposal().changes().get(0);
        assertThat(bullet.before()).isEqualTo("Wrote docs");
        assertThat(bullet.section()).isEqualTo("Engineer · Globex");
        verify(metering).record(eq("user"), eq(AiTask.TAILOR), any());
    }

    @Test
    void anotherUsersResumeIs404() {
        User other = new User();
        other.setId(99L);
        Resume theirs = new Resume().label("Theirs").parsedJson("{}");
        theirs.setId(50L);
        theirs.setUser(other);
        when(resumes.findById(50L)).thenReturn(Optional.of(theirs));
        assertThatThrownBy(() -> service.proposeForApplication(5L, 50L, true)).isInstanceOf(ResponseStatusException.class);
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    // ---- apply -------------------------------------------------------------------------------

    private ResumeTailor stored(String json) {
        ResumeTailor row = new ResumeTailor();
        row.setUser(user);
        row.setResumeId(11L);
        row.setResumeHash(ResumeTailorService.resumeHash(resume));
        row.setResultJson(json);
        when(tailors.findByIdAndUserId(3L, 7L)).thenReturn(Optional.of(row));
        return row;
    }

    @Test
    void savingBuildsANewResumeWithOnlyTheKeptChanges() throws Exception {
        stored("{\"bullets\":[{\"ref\":\"e0b2\",\"text\":\"Wrote design docs\"},{\"ref\":\"e0b0\",\"text\":\"Built Kafka pipelines at 1,200 rps\"}],\"skillsOrder\":[\"Kafka\",\"Java\",\"Python\",\"Docker\"]}");
        ResumeDTO created = new ResumeDTO();
        created.setId(12L);
        created.setLabel("Backend v3 — Acme");
        when(profile.createResume(any())).thenReturn(created);
        Resume createdEntity = new Resume().label("Backend v3 — Acme");
        createdEntity.setId(12L);
        when(resumes.findById(12L)).thenReturn(Optional.of(createdEntity));

        service.apply(3L, List.of("e0b2", "skills"), "Backend v3 — Acme", 5L);

        ArgumentCaptor<ResumeDTO> dto = ArgumentCaptor.forClass(ResumeDTO.class);
        verify(profile).createResume(dto.capture());
        JsonNode doc = om.readTree(dto.getValue().getParsedJson());
        assertThat(doc.path("experience").get(0).path("bullets").get(2).asText()).isEqualTo("Wrote design docs");
        assertThat(doc.path("experience").get(0).path("bullets").get(0).asText()).as("not kept").isEqualTo("Built event pipelines handling 1,200 requests per second");
        assertThat(doc.path("experience").get(0).path("company").asText()).isEqualTo("Globex");
        assertThat(doc.path("education").get(0).path("school").asText()).isEqualTo("State U");
        assertThat(doc.path("skills").get(0).asText()).isEqualTo("Kafka");
        assertThat(dto.getValue().getLabel()).isEqualTo("Backend v3 — Acme");
        assertThat(app.getResume()).as("linked to the application").isSameAs(createdEntity);
        assertThat(resume.getParsedJson()).as("the original is untouched").isEqualTo(RESUME_JSON);
    }

    @Test
    void aChangedResumeRefusesAnOldProposal() {
        stored("{\"bullets\":[{\"ref\":\"e0b2\",\"text\":\"Wrote design docs\"}]}");
        resume.setParsedJson(RESUME_JSON.replace("Wrote docs", "Wrote runbooks"));
        assertThatThrownBy(() -> service.apply(3L, List.of("e0b2"), null, null))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("changed");
        verify(profile, never()).createResume(any());
    }

    @Test
    void keepingNothingOrUnknownRefsIsRefused() {
        stored("{\"bullets\":[{\"ref\":\"e0b2\",\"text\":\"Wrote design docs\"}]}");
        assertThatThrownBy(() -> service.apply(3L, List.of(), null, null)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.apply(3L, List.of("e0b0", "summary"), null, null)).isInstanceOf(ResponseStatusException.class);
        verify(profile, never()).createResume(any());
    }

    @Test
    void someoneElsesProposalIs404() {
        when(tailors.findByIdAndUserId(3L, 7L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.apply(3L, List.of("e0b2"), null, null)).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void theDefaultNameSaysItIsTailored() throws Exception {
        stored("{\"bullets\":[{\"ref\":\"e0b2\",\"text\":\"Wrote design docs\"}]}");
        ResumeDTO created = new ResumeDTO();
        created.setId(12L);
        when(profile.createResume(any())).thenReturn(created);
        service.apply(3L, List.of("e0b2"), "  ", null);
        ArgumentCaptor<ResumeDTO> dto = ArgumentCaptor.forClass(ResumeDTO.class);
        verify(profile).createResume(dto.capture());
        assertThat(dto.getValue().getLabel()).isEqualTo("Backend v3 (tailored)");
    }
}
