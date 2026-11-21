package com.dossier.api.web.rest.ent.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.IdempotencyService.Outcome;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.pipeline.OrgMatchService;
import com.dossier.api.service.ent.pipeline.OrgMatchQueryService;
import com.dossier.api.service.ent.pipeline.OrgMatchViews;
import com.dossier.api.service.ent.pipeline.OpportunityMatchLifecycleService;
import com.dossier.api.domain.ent.pipeline.OpportunityMatch;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.lang.reflect.Method;
import java.util.Map;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.RequestMapping;

class OrgMatchResourceTest {

    private static final Long ORG = 1L;
    private static final Long CONSULTANT = 7L;
    private static final String KEY = "run-key-123";

    private final OrgMatchService service = mock(OrgMatchService.class);
    private final IdempotencyService idempotency = mock(IdempotencyService.class);
    private final OrgMatchQueryService query = mock(OrgMatchQueryService.class);
    private final OpportunityMatchLifecycleService lifecycle = mock(OpportunityMatchLifecycleService.class);
    private final OrgMembership me = new OrgMembership(ORG, 9L, 90L, "sarah", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private MockMvc mvc;

    @SuppressWarnings({ "unchecked", "rawtypes" })
    @BeforeEach
    void setUp() {
        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule()).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        when(idempotency.execute(any(), any(), eq(true), eq("POST"), anyString(), any(), eq(200), eq(OrgMatchService.Result.class), any()))
            .thenAnswer(invocation -> new Outcome(((Supplier) invocation.getArgument(8)).get(), 200, false));
        mvc = MockMvcBuilders.standaloneSetup(new OrgMatchResource(service, idempotency, query, lifecycle))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(mapper))
            .build();
    }

    @Test
    void exposesTheExactRunRouteAndPathMemberGuard() {
        assertThat(OrgMatchResource.class.getAnnotation(RequestMapping.class).value())
            .containsExactly("/api/orgs/{orgId}");
        Method run;
        try {
            run = OrgMatchResource.class.getDeclaredMethod(
                "run",
                OrgMembership.class,
                Long.class,
                String.class,
                jakarta.servlet.http.HttpServletRequest.class
            );
        } catch (NoSuchMethodException e) {
            throw new AssertionError(e);
        }
        OrgPermissionRequired guard = run.getAnnotation(OrgPermissionRequired.class);
        assertThat(guard).isNotNull();
        assertThat(guard.value()).isEmpty();
        assertThat(guard.beneficiary()).isEqualTo(Beneficiary.PATH_MEMBER);
    }

    @Test
    void bindsThePathActorAndRequiredIdempotencyKeyToTheProducer() throws Exception {
        when(service.matchOne(me, CONSULTANT, KEY)).thenReturn(new OrgMatchService.Result(OrgMatchService.Status.AI, 4, 3, 3));

        mvc.perform(
            post("/api/orgs/1/consultants/7/matches/run")
                .header("Idempotency-Key", KEY)
                .requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)
        )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("AI"))
            .andExpect(jsonPath("$.candidates").value(4))
            .andExpect(jsonPath("$.scored").value(3))
            .andExpect(jsonPath("$.written").value(3));

        verify(idempotency).execute(
            eq(me),
            eq(KEY),
            eq(true),
            eq("POST"),
            eq("/api/orgs/1/consultants/7/matches/run"),
            eq(Map.of()),
            eq(200),
            eq(OrgMatchService.Result.class),
            any()
        );
        verify(service).matchOne(me, CONSULTANT, KEY);
    }

    @Test
    void listsCanonicalRowsWithTheConsultantAndStatusFilters() throws Exception {
        OrgMatchViews.Row row = new OrgMatchViews.Row(11L, CONSULTANT, 101L, "JOB_POSTING", "Backend Engineer", "Acme", "Remote", "https://jobs.example/101", "https://jobs.example/apply/101", "BOARD_API", 91, "Strong Java fit", "gpt-test", "SUGGESTED_AI", "SUGGESTED", null, null);
        when(query.list(me, new OrgMatchViews.Query(CONSULTANT, "SUGGESTED"))).thenReturn(new OrgMatchViews.Response(java.util.List.of(row), 1));

        mvc.perform(
            get("/api/orgs/1/matches")
                .param("consultant", "7")
                .param("status", "SUGGESTED")
                .requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)
        )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.items[0].opportunityId").value(101))
            .andExpect(jsonPath("$.items[0].source").value("SUGGESTED_AI"))
            .andExpect(jsonPath("$.items[0].reason").value("Strong Java fit"));

        verify(query).list(me, new OrgMatchViews.Query(CONSULTANT, "SUGGESTED"));
    }

    @Test
    void dismissesThroughTheCanonicalLifecycleAndReturnsTheSafeRow() throws Exception {
        OpportunityMatch match = new OpportunityMatch();
        match.setId(11L);
        OrgMatchViews.Row row = new OrgMatchViews.Row(11L, CONSULTANT, 101L, "JOB_POSTING", "Backend Engineer", "Acme", "Remote", null, null, "BOARD_API", 91, "Not now", "gpt-test", "SUGGESTED_AI", "DISMISSED", null, null);
        when(lifecycle.dismiss(me, 11L)).thenReturn(match);
        when(query.row(match)).thenReturn(row);

        mvc.perform(post("/api/orgs/1/matches/11/dismiss").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(11))
            .andExpect(jsonPath("$.status").value("DISMISSED"));

        verify(lifecycle).dismiss(me, 11L);
        verify(query).row(match);
    }

    @Test
    void reviewHandlersCarryTheBeneficiaryMetadataTheyNeed() throws Exception {
        Method list = OrgMatchResource.class.getDeclaredMethod("list", OrgMembership.class, Long.class, String.class);
        Method dismiss = OrgMatchResource.class.getDeclaredMethod("dismiss", OrgMembership.class, Long.class);
        assertThat(list.getAnnotation(OrgPermissionRequired.class).beneficiary()).isEqualTo(Beneficiary.QUERY_MEMBER);
        assertThat(dismiss.getAnnotation(OrgPermissionRequired.class).beneficiary()).isEqualTo(Beneficiary.NONE);
    }

    @SuppressWarnings({ "unchecked", "rawtypes" })
    @Test
    void marksAnIdempotentReplayWithoutCallingTheProducerAgain() throws Exception {
        OrgMatchService.Result result = new OrgMatchService.Result(OrgMatchService.Status.REPLAYED, 0, 0, 0);
        when(idempotency.execute(any(), any(), eq(true), eq("POST"), anyString(), any(), eq(200), eq(OrgMatchService.Result.class), any()))
            .thenReturn(new Outcome(result, 200, true));

        mvc.perform(
            post("/api/orgs/1/consultants/7/matches/run")
                .header("Idempotency-Key", KEY)
                .requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)
        )
            .andExpect(status().isOk())
            .andExpect(header().string("Idempotent-Replayed", "true"))
            .andExpect(jsonPath("$.status").value("REPLAYED"));
    }
}
