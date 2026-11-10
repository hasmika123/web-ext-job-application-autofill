package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** The Performance resource without Spring: one read route with the period params, one own-targets write, both guarded, the 404 gate, and nothing that submits. */
class MktPerformanceResourceTest {

    private final MktPerformanceService service = mock(MktPerformanceService.class);
    private final OrgMembership me = new OrgMembership(1L, 7L, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new MktPerformanceResource(service)).setControllerAdvice(new Advice()).build();

    @org.springframework.web.bind.annotation.RestControllerAdvice
    static class Advice {
        @org.springframework.web.bind.annotation.ExceptionHandler(OrgNotFoundException.class)
        @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NOT_FOUND)
        void notFound() {}
    }

    private static MktPerformanceDto.View view() {
        return new MktPerformanceDto.View(
            Instant.parse("2026-10-13T10:00:00Z"), List.of(new MktPerformanceDto.Kpi("offerRate", 18.0, 6.0, List.of(1.0, 2.0))), null, null, null, null, null, List.of(), null, null, List.of()
        );
    }

    @Test
    void getPassesThePeriodsAndReturnsTheBoardJson() throws Exception {
        when(service.view(any(), any())).thenReturn(view());
        mvc.perform(get("/api/orgs/1/mkt/performance?weeks=12w&trend=6m&benchmarks=lastMonth").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.kpis[0].key").value("offerRate"))
            .andExpect(jsonPath("$.kpis[0].value").value(18.0))
            .andExpect(jsonPath("$.kpis[0].deltaPct").value(6.0))
            .andExpect(jsonPath("$.funnel").doesNotExist());
        ArgumentCaptor<MktPerformanceDto.Query> q = ArgumentCaptor.forClass(MktPerformanceDto.Query.class);
        verify(service).view(any(), q.capture());
        assertThat(q.getValue()).isEqualTo(new MktPerformanceDto.Query("12w", "6m", null, null, "lastMonth", null));
    }

    @Test
    void putGoalsDelegatesWithTheMembershipAndTheBody() throws Exception {
        when(service.updateGoals(any(), any())).thenReturn(new MktPerformanceDto.Goals("month", List.of(new MktPerformanceDto.GoalRow("submissions", "Submissions", 142, 200, 71)), true));
        mvc.perform(put("/api/orgs/1/mkt/performance/goals").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"submissions\":200,\"placements\":15}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rows[0].pct").value(71))
            .andExpect(jsonPath("$.canEdit").value(true));
        ArgumentCaptor<MktPerformanceDto.GoalsRequest> body = ArgumentCaptor.forClass(MktPerformanceDto.GoalsRequest.class);
        verify(service).updateGoals(any(), body.capture());
        assertThat(body.getValue()).isEqualTo(new MktPerformanceDto.GoalsRequest(200, null, null, 15));
    }

    @Test
    void theNotFoundGateIsA404OnBothRoutes() throws Exception {
        when(service.view(any(), any())).thenThrow(new OrgNotFoundException());
        when(service.updateGoals(any(), any())).thenThrow(new OrgNotFoundException());
        mvc.perform(get("/api/orgs/1/mkt/performance").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isNotFound());
        mvc.perform(put("/api/orgs/1/mkt/performance/goals").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"offers\":4}")).andExpect(status().isNotFound());
    }

    @Test
    void thereIsNoPostOrAnythingThatSubmits() throws Exception {
        mvc.perform(post("/api/orgs/1/mkt/performance").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isMethodNotAllowed());
        mvc.perform(post("/api/orgs/1/mkt/performance/goals").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isMethodNotAllowed());
        assertThat(MktPerformanceResource.class.getDeclaredMethods()).filteredOn(m -> !m.isSynthetic()).hasSize(2);
    }

    @Test
    void everyHandlerIsGuarded() {
        for (Method m : MktPerformanceResource.class.getDeclaredMethods()) if (!m.isSynthetic()) assertThat(m.isAnnotationPresent(OrgPermissionRequired.class)).as(m.getName()).isTrue();
    }
}
