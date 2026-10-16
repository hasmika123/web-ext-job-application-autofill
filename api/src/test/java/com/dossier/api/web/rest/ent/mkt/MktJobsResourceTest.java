package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.mkt.jobs.MktJobsDTO;
import com.dossier.api.service.ent.mkt.jobs.MktJobsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** {@link MktJobsResource}: parameter binding, delegation to the service with the resolved membership, status codes, and that every handler is org-guarded. */
class MktJobsResourceTest {

    private final MktJobsService service = mock(MktJobsService.class);
    private final OrgMembership me = new OrgMembership(1L, 7L, 70L, "marketer", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new MktJobsResource(service)).setMessageConverters(new MappingJackson2HttpMessageConverter(JsonMapper.builder().findAndAddModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS).build())).build();
    }

    private static MktJobsDTO.Response emptyBoard() {
        MktJobsDTO.Tile zero = new MktJobsDTO.Tile(0, null, List.of());
        return new MktJobsDTO.Response(new MktJobsDTO.Kpis(zero, zero, zero, zero), List.of(), 0, 0, 8, false, new MktJobsDTO.Facets(List.of(), List.of(), List.of(), List.of(), List.of()), List.of(), List.of(), List.of(), List.of(), List.of());
    }

    @Test
    void listBindsEveryFilterAndDelegatesWithTheMembership() throws Exception {
        when(service.list(eq(me), any())).thenReturn(emptyBoard());
        mvc
            .perform(get("/api/orgs/1/mkt/jobs").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)
                .param("page", "2").param("size", "20").param("q", "java").param("skills", "Java,AWS").param("location", "NY").param("workType", "REMOTE")
                .param("visa", "H-1B transfer").param("source", "Dice").param("rateMin", "50").param("rateMax", "90").param("sort", "rate_desc"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(0))
            .andExpect(jsonPath("$.canAssign").value(false));
        ArgumentCaptor<MktJobsDTO.Query> q = ArgumentCaptor.forClass(MktJobsDTO.Query.class);
        verify(service).list(eq(me), q.capture());
        assertThat(q.getValue()).isEqualTo(new MktJobsDTO.Query(2, 20, "java", List.of("Java", "AWS"), "NY", "REMOTE", "H-1B transfer", "Dice", 50, 90, "rate_desc"));
    }

    @Test
    void listDefaultsToTheFirstPageOfEight() throws Exception {
        when(service.list(eq(me), any())).thenReturn(emptyBoard());
        mvc.perform(get("/api/orgs/1/mkt/jobs").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        ArgumentCaptor<MktJobsDTO.Query> q = ArgumentCaptor.forClass(MktJobsDTO.Query.class);
        verify(service).list(eq(me), q.capture());
        assertThat(q.getValue().page()).isZero();
        assertThat(q.getValue().size()).isEqualTo(8);
        assertThat(q.getValue().skills()).isNull();
    }

    @Test
    void assignPassesOnlyTheConsultantAndReturnsTheRecord() throws Exception {
        when(service.assign(me, 10L, 100L)).thenReturn(new MktJobsDTO.AssignResult(77L, 10L, 100L, "ASSIGNED", 90, true));
        mvc
            .perform(post("/api/orgs/1/mkt/jobs/10/assign").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"consultantId\":100}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("ASSIGNED"))
            .andExpect(jsonPath("$.matchId").value(77))
            .andExpect(jsonPath("$.created").value(true));
        verify(service).assign(me, 10L, 100L);
    }

    @Test
    void candidatesDetailAndSavedSearchesDelegate() throws Exception {
        when(service.candidates(me, 10L, "al")).thenReturn(List.of(new MktJobsDTO.Candidate(100L, "Alex Morgan", "Java Developer", "AVAILABLE", 92, null, "On a project 2014 marketing paused")));
        mvc.perform(get("/api/orgs/1/mkt/jobs/10/candidates").param("q", "al").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("Alex Morgan")).andExpect(jsonPath("$[0].pausedReason").value("On a project 2014 marketing paused"));

        MktJobsDTO.Job job = new MktJobsDTO.Job(10L, "Senior Java Developer", new MktJobsDTO.Client(1L, "TechCorp", null), "New York, NY", "HYBRID", "$90 - $110/hr", new MktJobsDTO.Rate(9000L, 11000L, "HOUR", "USD"), "LinkedIn Jobs", Instant.parse("2026-10-13T10:00:00Z"), "HIGH", null, List.of("Java"), 1, "OPEN", "MINIMAL");
        when(service.detail(me, 10L)).thenReturn(new MktJobsDTO.Detail(job, "text", "CONTRACT", "6 months", "SENIOR", List.of(), null));
        mvc.perform(get("/api/orgs/1/mkt/jobs/10").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.job.title").value("Senior Java Developer")).andExpect(jsonPath("$.job.postedAt").value("2026-10-13T10:00:00Z"));

        when(service.createSavedSearch(eq(me), any())).thenReturn(new MktJobsDTO.SavedSearch(5L, "Java East", new MktJobsDTO.Criteria(null, List.of("Java"), null, null, null, null, null, null), 0));
        mvc
            .perform(post("/api/orgs/1/mkt/jobs/saved-searches").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Java East\",\"criteria\":{\"skills\":[\"Java\"]}}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(5));

        mvc.perform(post("/api/orgs/1/mkt/jobs/saved-searches/5/seen").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/orgs/1/mkt/jobs/saved-searches/5").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isNoContent());
        verify(service).markSeen(me, 5L);
        verify(service).deleteSavedSearch(me, 5L);
    }

    @Test
    void everyHandlerIsOrgGuardedAndThereIsNoSubmitRoute() {
        for (Method m : MktJobsResource.class.getDeclaredMethods()) {
            if (m.getDeclaringClass() != MktJobsResource.class || m.isSynthetic()) continue;
            assertThat(m.isAnnotationPresent(OrgPermissionRequired.class)).as(m.getName()).isTrue();
            assertThat(m.getName().toLowerCase()).as("E1: this resource never submits for a consultant").doesNotContain("submit");
        }
    }
}
