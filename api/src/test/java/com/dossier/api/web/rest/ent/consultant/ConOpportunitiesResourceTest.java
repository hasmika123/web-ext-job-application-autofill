package com.dossier.api.web.rest.ent.consultant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.IdempotencyService.Outcome;
import com.dossier.api.service.ent.consultant.ConOpportunityDTO;
import com.dossier.api.service.ent.consultant.ConOpportunityService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.RequestMapping;

/** The resource is a thin shell: namespace, one guard per handler, request binding, headers, and a response body without anything the consultant must not see. */
class ConOpportunitiesResourceTest {

    ConOpportunityService service = mock(ConOpportunityService.class);
    IdempotencyService idempotency = mock(IdempotencyService.class);
    OrgMembership me = new OrgMembership(1L, 7L, 70L, "anika", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    MockMvc mvc;

    static ConOpportunityDTO dto(String state) {
        return new ConOpportunityDTO(
            5L, state,
            new ConOpportunityDTO.Job(101L, "Java Developer", "Acme", "Austin, TX", "REMOTE", "CONTRACT", "$70-80/hr", "https://boards.greenhouse.io/acme/jobs/1", "greenhouse", "1", null, List.of("Java"), "MINIMAL"),
            "note", new ConOpportunityDTO.AssignedBy(9L, "Sarah"), Instant.parse("2026-10-13T10:00:00Z"), "MEDIUM", null, null, null, null, null, List.of("VIEWED"), 2
        );
    }

    @SuppressWarnings({ "unchecked", "rawtypes" })
    @BeforeEach
    void setUp() {
        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule()).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        when(idempotency.execute(any(), any(), eq(false), eq("POST"), anyString(), any(), eq(200), eq(ConOpportunityDTO.class), any()))
            .thenAnswer(i -> new Outcome(((Supplier) i.getArgument(8)).get(), 200, false));
        mvc = MockMvcBuilders.standaloneSetup(new ConOpportunitiesResource(service, idempotency)).setMessageConverters(new MappingJackson2HttpMessageConverter(mapper)).build();
    }

    @Test
    void theBaseIsTheConNamespaceAndEveryHandlerIsGuarded() {
        assertThat(ConOpportunitiesResource.class.getAnnotation(RequestMapping.class).value()).containsExactly("/api/orgs/{orgId}/con/opportunities");
        long handlers = Arrays.stream(ConOpportunitiesResource.class.getDeclaredMethods()).filter(m -> Modifier.isPublic(m.getModifiers())).peek(this::guarded).count();
        assertThat(handlers).isEqualTo(9);
    }

    private void guarded(Method m) {
        assertThat(m.isAnnotationPresent(OrgPermissionRequired.class)).as(m.getName()).isTrue();
    }

    @Test
    void listBindsTheFilters() throws Exception {
        when(service.list(me, "ASSIGNED,VIEWED", 1, 50, null, null, null)).thenReturn(new ConOpportunityDTO.ListResponse(List.of(dto("ASSIGNED")), 7));
        mvc.perform(get("/api/orgs/1/con/opportunities?state=ASSIGNED,VIEWED&page=1&size=50").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(7))
            .andExpect(jsonPath("$.items[0].id").value(5))
            .andExpect(jsonPath("$.items[0].job.company").value("Acme"))
            .andExpect(jsonPath("$.items[0].job.payLabel").value("$70-80/hr"))
            .andExpect(jsonPath("$.items[0].allowedActions[0]").value("VIEWED"))
            .andExpect(jsonPath("$.items[0].assignedBy.name").value("Sarah"));
    }

    @Test
    void listBindsTheMatchParametersForTheExtension() throws Exception {
        when(service.list(me, null, null, null, "https://boards.greenhouse.io/acme/jobs/1", "greenhouse", "1")).thenReturn(new ConOpportunityDTO.ListResponse(List.of(), 0));
        mvc.perform(get("/api/orgs/1/con/opportunities").param("match", "https://boards.greenhouse.io/acme/jobs/1").param("atsPlatform", "greenhouse").param("externalJobId", "1")
            .requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void theResponseNeverCarriesWhatAConsultantMustNotSee() throws Exception {
        when(service.get(me, 5L)).thenReturn(dto("ASSIGNED"));
        String json = mvc.perform(get("/api/orgs/1/con/opportunities/5").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        for (String forbidden : List.of("ownerMemberId", "rateMin", "rateMax", "rateUnit", "contact", "otherConsultants", "matches", "internalNote")) {
            assertThat(json).as(forbidden).doesNotContainIgnoringCase(forbidden);
        }
    }

    @Test
    void postsWithoutABodyPassTheIfMatchHeader() throws Exception {
        when(service.viewed(me, 5L, "\"2\"")).thenReturn(dto("VIEWED"));
        when(service.interest(me, 5L, null)).thenReturn(dto("INTERESTED"));
        when(service.unlink(me, 5L, null)).thenReturn(dto("APPLIED"));
        mvc.perform(post("/api/orgs/1/con/opportunities/5/viewed").header("If-Match", "\"2\"").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me))
            .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("VIEWED"));
        mvc.perform(post("/api/orgs/1/con/opportunities/5/interest").content("{}").contentType(MediaType.APPLICATION_JSON).requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me))
            .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("INTERESTED"));
        mvc.perform(post("/api/orgs/1/con/opportunities/5/unlink").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
    }

    @Test
    void declineAndRequestInfoBindTheirBodies() throws Exception {
        when(service.decline(me, 5L, "RATE", "too low", null)).thenReturn(dto("DECLINED"));
        when(service.requestInfo(me, 5L, "W2 possible?", null)).thenReturn(dto("NEEDS_INFO"));
        mvc.perform(post("/api/orgs/1/con/opportunities/5/decline").content("{\"reason\":\"RATE\",\"note\":\"too low\"}").contentType(MediaType.APPLICATION_JSON)
            .requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("DECLINED"));
        mvc.perform(post("/api/orgs/1/con/opportunities/5/request-info").content("{\"question\":\"W2 possible?\"}").contentType(MediaType.APPLICATION_JSON)
            .requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("NEEDS_INFO"));
    }

    @Test
    void appliedAndLinkRunThroughTheOptionalIdempotencyKeyAndCarryTheApplicationId() throws Exception {
        when(service.applied(me, 5L, 55L, null)).thenReturn(dto("APPLIED"));
        when(service.link(me, 5L, 55L, null)).thenReturn(dto("APPLIED"));
        when(service.applied(me, 5L, null, null)).thenReturn(dto("APPLIED"));
        mvc.perform(post("/api/orgs/1/con/opportunities/5/applied").header("Idempotency-Key", "11111111-2222-3333-4444-555555555555").content("{\"applicationId\":55}")
            .contentType(MediaType.APPLICATION_JSON).requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("APPLIED"));
        verify(idempotency).execute(eq(me), eq("11111111-2222-3333-4444-555555555555"), eq(false), eq("POST"), eq("/api/orgs/1/con/opportunities/5/applied"), any(), eq(200), eq(ConOpportunityDTO.class), any());
        mvc.perform(post("/api/orgs/1/con/opportunities/5/link").content("{\"applicationId\":55}").contentType(MediaType.APPLICATION_JSON)
            .requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        mvc.perform(post("/api/orgs/1/con/opportunities/5/applied").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        verify(service).link(me, 5L, 55L, null);
        verify(service).applied(me, 5L, null, null);
    }

    @Test
    void theIdempotencyRequestCoversTheRouteTheApplicationAndTheIfMatchVersion() throws Exception {
        when(service.applied(any(), any(), any(), any())).thenReturn(dto("APPLIED"));
        org.mockito.ArgumentCaptor<Object> request = org.mockito.ArgumentCaptor.forClass(Object.class);
        org.mockito.ArgumentCaptor<String> path = org.mockito.ArgumentCaptor.forClass(String.class);
        for (String version : new String[] { "3", "4" }) {
            mvc.perform(post("/api/orgs/1/con/opportunities/5/applied").header("Idempotency-Key", "11111111-2222-3333-4444-555555555555").header("If-Match", version)
                .content("{\"applicationId\":55}").contentType(MediaType.APPLICATION_JSON).requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        }
        verify(idempotency, org.mockito.Mockito.times(2)).execute(eq(me), anyString(), eq(false), eq("POST"), path.capture(), request.capture(), eq(200), eq(ConOpportunityDTO.class), any());
        org.assertj.core.api.Assertions.assertThat(request.getAllValues().get(0)).as("another If-Match is another request, so the ledger answers 422 instead of replaying").isNotEqualTo(request.getAllValues().get(1));
        org.assertj.core.api.Assertions.assertThat(request.getAllValues().get(0).toString()).contains("55").contains("3");
        org.assertj.core.api.Assertions.assertThat(path.getAllValues().get(0)).isEqualTo("/api/orgs/1/con/opportunities/5/applied");
    }

    @SuppressWarnings({ "unchecked", "rawtypes" })
    @Test
    void aReplayedIdempotentCallIsMarkedSo() throws Exception {
        when(idempotency.execute(any(), any(), eq(false), eq("POST"), anyString(), any(), eq(200), eq(ConOpportunityDTO.class), any())).thenReturn(new Outcome(dto("APPLIED"), 200, true));
        mvc.perform(post("/api/orgs/1/con/opportunities/5/applied").header("Idempotency-Key", "11111111-2222-3333-4444-555555555555").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me))
            .andExpect(status().isOk()).andExpect(header().string("Idempotent-Replayed", "true"));
    }
}
