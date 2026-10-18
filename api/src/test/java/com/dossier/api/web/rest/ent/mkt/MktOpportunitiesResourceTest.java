package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.ActionResult;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.BulkResult;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.Filters;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.ListResponse;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.Responses;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesService;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesService.Query;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.RequestMapping;

/** The REST layer on its own (standalone MockMvc): params reach the service, the CSV is a download, and there is no route that sets a consultant's interest. */
class MktOpportunitiesResourceTest {

    MktOpportunitiesService service = mock(MktOpportunitiesService.class);
    MockMvc mvc;
    OrgMembership me = new OrgMembership(7L, 70L, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new MktOpportunitiesResource(service)).build();
    }

    private static final ListResponse EMPTY = new ListResponse(List.of(), List.of(), 0, 0, 8, List.of(), new Responses(0, 30, List.of()), List.of(), new Filters(List.of(), List.of()));

    @Test
    void theBoardFiltersReachTheService() throws Exception {
        when(service.list(any(), any())).thenReturn(EMPTY);
        mvc.perform(get("/api/orgs/7/mkt/opportunities?q=alex&consultantId=3&clientId=4&interest=OPEN&minScore=80&days=0&stale=true&ready=true&sort=score&dir=asc&page=2&size=20&responseDays=7")
                .requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(0));
        ArgumentCaptor<Query> q = ArgumentCaptor.forClass(Query.class);
        verify(service).list(eq(me), q.capture());
        assertThat(q.getValue()).isEqualTo(new Query("alex", 3L, 4L, "OPEN", 80, 0, true, true, "score", false, 2, 20, 7));
    }

    @Test
    void defaultsAreTheBoardsLastThirtyDays() throws Exception {
        when(service.list(any(), any())).thenReturn(EMPTY);
        mvc.perform(get("/api/orgs/7/mkt/opportunities").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        ArgumentCaptor<Query> q = ArgumentCaptor.forClass(Query.class);
        verify(service).list(eq(me), q.capture());
        assertThat(q.getValue().days()).isEqualTo(30);
        assertThat(q.getValue().size()).isEqualTo(8);
        assertThat(q.getValue().desc()).isTrue();
    }

    @Test
    void theExportIsACsvDownload() throws Exception {
        when(service.exportCsv(any(), any())).thenReturn("Consultant,Job Title\r\nAlex,Java\r\n");
        mvc.perform(get("/api/orgs/7/mkt/opportunities/export?interest=OPEN").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Disposition", "attachment; filename=\"opportunities.csv\""))
            .andExpect(content().contentTypeCompatibleWith(MediaType.parseMediaType("text/csv")))
            .andExpect(content().string("Consultant,Job Title\r\nAlex,Java\r\n"));
    }

    @Test
    void aNotFoundFromTheServiceIsNotSwallowed() {
        when(service.detail(any(), eq(5L))).thenThrow(new OrgNotFoundException());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> mvc.perform(get("/api/orgs/7/mkt/opportunities/5").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)))
            .hasRootCauseInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void writesDelegateToTheServiceAsRequests() throws Exception {
        when(service.assign(any(), eq(5L), any())).thenReturn(new ActionResult(null, "Assigned.", true));
        when(service.requestFromConsultant(any(), eq(5L), eq("RESUME"))).thenReturn(new ActionResult(null, "Asked.", true));
        when(service.bulkAssign(any(), any())).thenReturn(new BulkResult(2, List.of(), "Assigned 2 opportunities."));
        when(service.notifyAwaiting(any())).thenReturn(new BulkResult(3, List.of(), "Asked 3 consultants for their interest."));
        when(service.setNextAction(any(), eq(5L), any())).thenReturn(new ActionResult(null, "Next action updated.", true));

        mvc.perform(post("/api/orgs/7/mkt/opportunities/5/assign").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.message").value("Assigned."));
        mvc.perform(post("/api/orgs/7/mkt/opportunities/5/request").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"RESUME\"}")).andExpect(status().isOk());
        mvc.perform(post("/api/orgs/7/mkt/opportunities/bulk-assign").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[1,2]}")).andExpect(status().isOk()).andExpect(jsonPath("$.done").value(2));
        mvc.perform(post("/api/orgs/7/mkt/opportunities/notify").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.done").value(3));
        mvc.perform(patch("/api/orgs/7/mkt/opportunities/5/next-action").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"nextActionAt\":\"2026-10-20T09:00:00Z\"}")).andExpect(status().isOk());
        verify(service).bulkAssign(me, List.of(1L, 2L));
    }

    @Test
    void thereIsNoRouteThatAnswersForTheConsultantOrSubmits() {
        for (Method m : MktOpportunitiesResource.class.getDeclaredMethods()) {
            String name = m.getName().toLowerCase();
            // The one exception is the contract's answer-info (doc 60 section 4): the marketer answers the consultant's QUESTION; it stores info_answer and
            // changes no state (MktOpportunitiesAnswerInfoTest). Nothing else may answer, respond, set an interest or submit.
            String checked = name.equals("answerinfo") ? "" : name;
            assertThat(checked).as("endpoint " + m.getName()).doesNotContain("submit").doesNotContain("setinterest").doesNotContain("respond").doesNotContain("answer");
        }
        RequestMapping base = MktOpportunitiesResource.class.getAnnotation(RequestMapping.class);
        assertThat(base.value()).containsExactly("/api/orgs/{orgId}/mkt/opportunities");
    }
}
