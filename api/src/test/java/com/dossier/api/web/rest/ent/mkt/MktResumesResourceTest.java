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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.mkt.resumes.MktResumesDto;
import com.dossier.api.service.ent.mkt.resumes.MktResumesService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** The wire contract of the Marketing Resumes resource (standalone MockMvc over a mocked service, no Docker). */
class MktResumesResourceTest {

    final MktResumesService service = mock(MktResumesService.class);
    final MockMvc mvc = MockMvcBuilders.standaloneSetup(new MktResumesResource(service)).build();
    final OrgMembership me = new OrgMembership(7L, 50L, 1L, "sarah", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    static MktResumesDto.Row row() {
        return new MktResumesDto.Row(10L, 1L, "Alex Morgan", "Java Developer", null, "Alex Morgan - Consulting Resume", null, 3, null, true, 92, "APPROVED", false, true);
    }

    static MktResumesDto.Detail detail() {
        return new MktResumesDto.Detail(row(), "h", "s", null, null, List.of(), List.of(), List.of());
    }

    @Test
    void listMapsEveryFilterAndPaging() throws Exception {
        when(service.list(any(), any())).thenReturn(new MktResumesDto.Page(List.of(), List.of(row()), 48, 2, 10, List.of("Java"), List.of(), false));
        mvc.perform(get("/api/orgs/7/mkt/resumes").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)
                .param("q", "alex").param("skill", "Java").param("status", "APPROVED").param("updated", "3m").param("availability", "AVAILABLE")
                .param("sort", "title,asc").param("page", "2").param("size", "10"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(48))
            .andExpect(jsonPath("$.items[0].consultantName").value("Alex Morgan"))
            .andExpect(jsonPath("$.items[0].hasFile").value(false));
        ArgumentCaptor<MktResumesDto.Query> q = ArgumentCaptor.forClass(MktResumesDto.Query.class);
        verify(service).list(eq(me), q.capture());
        assertThat(q.getValue()).isEqualTo(new MktResumesDto.Query("alex", "Java", "APPROVED", "3m", "AVAILABLE", "title,asc", 2, 10));
    }

    @Test
    void patchPassesOnlyTheBodyToTheEditService() throws Exception {
        when(service.edit(any(), any(), any())).thenReturn(detail());
        mvc.perform(patch("/api/orgs/7/mkt/resumes/10").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"headline\":\"New\"}"))
            .andExpect(status().isOk());
        verify(service).edit(eq(me), eq(10L), eq(Map.of("headline", "New")));
    }

    @Test
    void approvalRequestAndNeedsUpdateAreRecordsNotApprovals() throws Exception {
        when(service.requestApproval(any(), any())).thenReturn(detail());
        when(service.markNeedsUpdate(any(), any(), any())).thenReturn(detail());
        mvc.perform(post("/api/orgs/7/mkt/resumes/10/approval-request").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        mvc.perform(post("/api/orgs/7/mkt/resumes/10/needs-update").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"stale\"}"))
            .andExpect(status().isOk());
        verify(service).requestApproval(me, 10L);
        verify(service).markNeedsUpdate(me, 10L, "stale");
    }

    @Test
    void everyHandlerDeclaresTheOrgPermissionGate() {
        for (Method m : MktResumesResource.class.getDeclaredMethods()) {
            if (java.lang.reflect.Modifier.isPublic(m.getModifiers())) assertThat(m.isAnnotationPresent(OrgPermissionRequired.class)).as(m.getName()).isTrue();
        }
    }
}
