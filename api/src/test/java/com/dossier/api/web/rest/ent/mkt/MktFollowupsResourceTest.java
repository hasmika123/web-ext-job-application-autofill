package com.dossier.api.web.rest.ent.mkt;

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
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.ActionResult;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Bucket;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Insights;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Page;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.View;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Window;
import com.dossier.api.service.ent.mkt.followups.MktFollowupService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.assertj.core.api.Assertions.assertThat;

/** The Follow-ups resource without Spring: the routes delegate to the service with the resolved membership, validation answers 400, and every handler is guarded. */
class MktFollowupsResourceTest {

    private final MktFollowupService service = mock(MktFollowupService.class);
    private final OrgMembership me = new OrgMembership(1L, 7L, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new MktFollowupsResource(service)).build();

    private static View emptyView() {
        Page p = new Page(List.of(), 0, 0, 50);
        return new View(Instant.parse("2026-10-13T10:00:00Z"), List.of(), p, p, p, new Insights("THIS_WEEK", null, null, 0, 0));
    }

    @Test
    void getDelegatesWithTheMembershipAndDefaults() throws Exception {
        when(service.view(eq(me), eq(Window.THIS_WEEK), eq(50), any())).thenReturn(emptyView());
        mvc.perform(get("/api/orgs/1/mkt/followups").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.insights.window").value("THIS_WEEK"));
        verify(service).view(me, Window.THIS_WEEK, 50, null);
    }

    @Test
    void windowAndSearchAreForwarded() throws Exception {
        when(service.view(eq(me), eq(Window.LAST_WEEK), eq(20), eq("tech"))).thenReturn(emptyView());
        mvc.perform(get("/api/orgs/1/mkt/followups?window=LAST_WEEK&size=20&q=tech").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        verify(service).view(me, Window.LAST_WEEK, 20, "tech");
    }

    @Test
    void listForwardsBucketPagingAndSort() throws Exception {
        when(service.list(eq(me), eq(Bucket.OVERDUE), eq(1), eq(10), any(), eq("dueAt,desc"))).thenReturn(new Page(List.of(), 0, 1, 10));
        mvc.perform(get("/api/orgs/1/mkt/followups/list?bucket=OVERDUE&page=1&size=10&sort=dueAt,desc").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.page").value(1));
    }

    @Test
    void writesDelegateAndTheReminderReplyIsNeverEmailed() throws Exception {
        when(service.sendReminder(eq(me), eq(5L), any())).thenReturn(new ActionResult(null, "REMINDER_SENT", false));
        mvc.perform(post("/api/orgs/1/mkt/followups/5/reminder").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"hi\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.emailed").value(false)).andExpect(jsonPath("$.event").value("REMINDER_SENT"));
        when(service.complete(me, 5L)).thenReturn(new ActionResult(null, "STATUS_CHANGED", false));
        mvc.perform(post("/api/orgs/1/mkt/followups/5/complete").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        when(service.updateStatus(me, 5L, "WAITING")).thenReturn(new ActionResult(null, "STATUS_CHANGED", false));
        mvc.perform(patch("/api/orgs/1/mkt/followups/5/status").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"WAITING\"}")).andExpect(status().isOk());
        verify(service).updateStatus(me, 5L, "WAITING");
    }

    @Test
    void invalidBodiesAreRefusedBeforeTheService() throws Exception {
        mvc.perform(post("/api/orgs/1/mkt/followups/5/call").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/orgs/1/mkt/followups").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"x\"}")).andExpect(status().isBadRequest());
        mvc.perform(patch("/api/orgs/1/mkt/followups/5/status").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
    }

    @Test
    void everyHandlerCarriesTheOrgPermissionGuard() {
        int handlers = 0;
        for (Method m : MktFollowupsResource.class.getDeclaredMethods()) {
            if (m.getDeclaringClass() != MktFollowupsResource.class || java.lang.reflect.Modifier.isPrivate(m.getModifiers())) continue;
            handlers++;
            assertThat(m.isAnnotationPresent(OrgPermissionRequired.class)).as(m.getName()).isTrue();
        }
        assertThat(handlers).isEqualTo(7);
    }

    @Test
    void thereIsNoRouteThatSubmitsOrSendsAnything() {
        for (Method m : MktFollowupsResource.class.getDeclaredMethods()) assertThat(m.getName().toLowerCase()).doesNotContain("submit").doesNotContain("email").doesNotContain("send");
    }
}
