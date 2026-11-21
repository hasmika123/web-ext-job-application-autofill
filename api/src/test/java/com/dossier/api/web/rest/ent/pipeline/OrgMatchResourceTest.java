package com.dossier.api.web.rest.ent.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
    private final OrgMembership me = new OrgMembership(ORG, 9L, 90L, "sarah", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private MockMvc mvc;

    @SuppressWarnings({ "unchecked", "rawtypes" })
    @BeforeEach
    void setUp() {
        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule()).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        when(idempotency.execute(any(), any(), eq(true), eq("POST"), anyString(), any(), eq(200), eq(OrgMatchService.Result.class), any()))
            .thenAnswer(invocation -> new Outcome(((Supplier) invocation.getArgument(8)).get(), 200, false));
        mvc = MockMvcBuilders.standaloneSetup(new OrgMatchResource(service, idempotency))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(mapper))
            .build();
    }

    @Test
    void exposesTheExactRunRouteAndPathMemberGuard() {
        assertThat(OrgMatchResource.class.getAnnotation(RequestMapping.class).value())
            .containsExactly("/api/orgs/{orgId}/consultants/{memberId}/matches");
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
