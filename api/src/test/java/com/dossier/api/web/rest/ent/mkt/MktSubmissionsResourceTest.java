package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsDto.*;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;

/** The Submissions resource without a database: routes, parameter binding, status codes, and the E1 guard that no route submits anything. */
class MktSubmissionsResourceTest {

    private final MktSubmissionsService service = mock(MktSubmissionsService.class);
    private MockMvc mvc;
    private final OrgMembership me = new OrgMembership(1L, 7L, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private static final String BASE = "/api/orgs/1/mkt/submissions";

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new MktSubmissionsResource(service)).build();
    }

    private static Row row(long id) {
        return new Row(id, "SUB-2026-001", new Person(1L, "Alex Morgan", "Java Developer", null), new Job(11L, "Senior Java Developer", "JOB-1011"), new ClientRef(21L, "TechCorp"), Instant.parse("2026-10-13T08:00:00Z"), "APPROVED", null, "SUBMITTED", "SUBMITTED", List.of("RECORD_STATUS"), null, null);
    }

    @Test
    void theBoardBindsEveryFilterAndReturnsTheDocument() throws Exception {
        Kpi k = new Kpi(12, 20.0, List.of(1L, 2L));
        when(service.board(any(), any())).thenReturn(new BoardResponse(
            new Kpis(k, k, k, k), List.of(row(1)), 86, 2, 10, new Breakdown("30d", 86, List.of()), List.of(), new FilterOptions(List.of(), List.of()), List.of()
        ));
        mvc.perform(get(BASE).requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)
                .param("q", "alex").param("status", "CLIENT_REVIEW").param("approval", "APPROVED").param("clientId", "21").param("jobTitle", "Data Analyst")
                .param("period", "7d").param("donutPeriod", "all").param("sort", "client").param("dir", "desc").param("page", "2").param("size", "25"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(86))
            .andExpect(jsonPath("$.items[0].job.code").value("JOB-1011"))
            .andExpect(jsonPath("$.kpis.pendingApprovals.value").value(12));
        ArgumentCaptor<Query> q = ArgumentCaptor.forClass(Query.class);
        verify(service).board(eq(me), q.capture());
        assertThat(q.getValue()).isEqualTo(new Query("alex", "CLIENT_REVIEW", "APPROVED", 21L, "Data Analyst", "7d", "all", "client", "desc", 2, 25));
    }

    @Test
    void theBoardDefaultsToPageZeroOfTen() throws Exception {
        when(service.board(any(), any())).thenReturn(null);
        mvc.perform(get(BASE).requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        ArgumentCaptor<Query> q = ArgumentCaptor.forClass(Query.class);
        verify(service).board(eq(me), q.capture());
        assertThat(q.getValue().page()).isZero();
        assertThat(q.getValue().size()).isEqualTo(10);
    }

    @Test
    void createReturns201AndThePreparedDraft() throws Exception {
        when(service.create(any(), any())).thenReturn(row(5));
        mvc.perform(post(BASE).requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"consultantId\":1,\"requirementId\":11,\"note\":\"fit\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(5));
        verify(service).create(eq(me), eq(new CreateRequest(1L, 11L, null, "fit")));
    }

    @Test
    void theApprovalAndStatusRoutesCallTheRecordingMethods() throws Exception {
        when(service.requestApproval(any(), eq(5L))).thenReturn(row(5));
        when(service.recordApproval(any(), eq(5L), any())).thenReturn(row(5));
        when(service.recordStatus(any(), eq(5L), any())).thenReturn(row(5));
        mvc.perform(post(BASE + "/5/request-approval").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        mvc.perform(post(BASE + "/5/approval").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"APPROVED\"}")).andExpect(status().isOk());
        mvc.perform(patch(BASE + "/5/status").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"CLIENT_REVIEW\"}")).andExpect(status().isOk());
        verify(service).recordApproval(eq(me), eq(5L), eq(new ApprovalRequest("APPROVED", null)));
        verify(service).recordStatus(eq(me), eq(5L), eq(new StatusRequest("CLIENT_REVIEW", null)));
    }

    @Test
    void withdrawAndDeleteViewAnswerNoContent() throws Exception {
        mvc.perform(delete(BASE + "/5").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isNoContent());
        mvc.perform(delete(BASE + "/views/9").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isNoContent());
        verify(service).withdraw(me, 5L);
        verify(service).deleteView(me, 9L);
    }

    @Test
    void saveViewReturns201() throws Exception {
        when(service.saveView(any(), any())).thenReturn(new SavedView(3L, "My view", null, "CLIENT_REVIEW", null, null, null, "30d"));
        mvc.perform(post(BASE + "/views").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"My view\",\"status\":\"CLIENT_REVIEW\",\"period\":\"30d\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value("My view"));
    }

    @Test
    void aMissingRecordIsTheGenericNotFound() throws Exception {
        when(service.detail(any(), eq(404L))).thenThrow(new OrgNotFoundException());
        try {
            mvc.perform(get(BASE + "/404").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me));
        } catch (Exception e) {
            assertThat(e.getCause()).isInstanceOf(OrgNotFoundException.class); // standalone MockMvc has no ExceptionTranslator; the real one renders the 404
        }
    }

    /** E1: no route of this resource is named or shaped like "submit for a consultant"; every handler is a read, a draft, a request or a record. */
    @Test
    void noRouteSubmitsAnythingForAConsultant() {
        List<String> paths = new ArrayList<>();
        for (Method m : MktSubmissionsResource.class.getDeclaredMethods()) {
            GetMapping g = m.getAnnotation(GetMapping.class);
            PostMapping p = m.getAnnotation(PostMapping.class);
            PatchMapping pa = m.getAnnotation(PatchMapping.class);
            DeleteMapping d = m.getAnnotation(DeleteMapping.class);
            if (g != null) paths.addAll(List.of(g.value()));
            if (p != null) paths.addAll(List.of(p.value()));
            if (pa != null) paths.addAll(List.of(pa.value()));
            if (d != null) paths.addAll(List.of(d.value()));
            assertThat(m.getName()).doesNotContainIgnoringCase("submitFor").doesNotContainIgnoringCase("send").doesNotContainIgnoringCase("apply");
        }
        assertThat(paths).noneMatch(s -> s.toLowerCase().contains("submit") || s.toLowerCase().contains("send") || s.toLowerCase().contains("apply"));
        assertThat(paths).contains("/{id}/request-approval", "/{id}/approval", "/{id}/status", "/options", "/views");
    }
}
