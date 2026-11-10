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
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.ActionResult;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Calendar;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Option;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Options;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Page;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Query;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Tab;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Tabs;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.View;
import com.dossier.api.service.ent.mkt.tasks.MktTasksService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** The Tasks resource without Spring: the routes delegate to the service with the resolved membership, validation answers 400, and every handler is guarded. */
class MktTasksResourceTest {

    private final MktTasksService service = mock(MktTasksService.class);
    private final OrgMembership me = new OrgMembership(1L, 7L, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new MktTasksResource(service)).build();

    private static View emptyView() {
        return new View(Instant.parse("2026-10-13T10:00:00Z"), false, List.of(), new Tabs(0, 0, 0, 0, 0, 0), new Page(List.of(), 0, 0, 10), List.of(), new Options(List.of(), List.of(), List.of()));
    }

    @Test
    void getDelegatesWithTheMembershipAndDefaults() throws Exception {
        when(service.view(eq(me), any())).thenReturn(emptyView());
        mvc.perform(get("/api/orgs/1/mkt/tasks").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.tabs.all").value(0));
        verify(service).view(me, new Query(Tab.ALL, null, null, null, null, null, null, 0, 10, null));
    }

    @Test
    void tabFiltersPagingAndSortAreForwarded() throws Exception {
        when(service.view(eq(me), any())).thenReturn(emptyView());
        mvc.perform(get("/api/orgs/1/mkt/tasks?tab=OVERDUE&category=RESUME&priority=HIGH&status=PENDING&owner=me&due=2026-10-15&q=tech&page=2&size=20&sort=dueAt,desc").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me))
            .andExpect(status().isOk());
        verify(service).view(me, new Query(Tab.OVERDUE, "RESUME", "HIGH", "PENDING", "me", "2026-10-15", "tech", 2, 20, "dueAt,desc"));
    }

    @Test
    void calendarAndAssigneesDelegate() throws Exception {
        when(service.calendar(me, "2026-10")).thenReturn(new Calendar("2026-10", List.of()));
        mvc.perform(get("/api/orgs/1/mkt/tasks/calendar?month=2026-10").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.month").value("2026-10"));
        when(service.assignees(me, 5L)).thenReturn(List.of(new Option(8L, "Michael Park")));
        mvc.perform(get("/api/orgs/1/mkt/tasks/5/assignees").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("Michael Park"));
    }

    @Test
    void writesDelegateAndNothingIsEverEmailed() throws Exception {
        when(service.create(eq(me), any())).thenReturn(new ActionResult(null, "CREATED", false));
        mvc.perform(post("/api/orgs/1/mkt/tasks").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Call\",\"dueAt\":\"2026-10-15T10:00:00Z\",\"category\":\"FOLLOW_UP\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.emailed").value(false)).andExpect(jsonPath("$.event").value("CREATED"));
        when(service.update(eq(me), eq(5L), any())).thenReturn(new ActionResult(null, "UPDATED", false));
        mvc.perform(patch("/api/orgs/1/mkt/tasks/5").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"priority\":\"LOW\"}")).andExpect(status().isOk());
        when(service.complete(me, 5L)).thenReturn(new ActionResult(null, "COMPLETED", false));
        mvc.perform(post("/api/orgs/1/mkt/tasks/5/complete").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        when(service.reopen(me, 5L)).thenReturn(new ActionResult(null, "REOPENED", false));
        mvc.perform(post("/api/orgs/1/mkt/tasks/5/reopen").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        when(service.reassign(me, 5L, 8L)).thenReturn(new ActionResult(null, "REASSIGNED", false));
        mvc.perform(post("/api/orgs/1/mkt/tasks/5/reassign").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"ownerMemberId\":8}")).andExpect(status().isOk());
        when(service.delete(me, 5L)).thenReturn(new ActionResult(null, "DELETED", false));
        mvc.perform(delete("/api/orgs/1/mkt/tasks/5").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.event").value("DELETED"));
        verify(service).reassign(me, 5L, 8L);
    }

    @Test
    void invalidBodiesAreRefusedBeforeTheService() throws Exception {
        mvc.perform(post("/api/orgs/1/mkt/tasks").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"x\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/orgs/1/mkt/tasks").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"\",\"dueAt\":\"2026-10-15T10:00:00Z\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/orgs/1/mkt/tasks/5/reassign").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
    }

    @Test
    void everyHandlerCarriesTheOrgPermissionGuard() {
        int handlers = 0;
        for (Method m : MktTasksResource.class.getDeclaredMethods()) {
            if (m.getDeclaringClass() != MktTasksResource.class || java.lang.reflect.Modifier.isPrivate(m.getModifiers())) continue;
            handlers++;
            assertThat(m.isAnnotationPresent(OrgPermissionRequired.class)).as(m.getName()).isTrue();
        }
        assertThat(handlers).isEqualTo(9);
    }

    @Test
    void thereIsNoRouteThatSubmitsOrSendsAnything() {
        for (Method m : MktTasksResource.class.getDeclaredMethods()) assertThat(m.getName().toLowerCase()).doesNotContain("submit").doesNotContain("email").doesNotContain("send");
    }
}
