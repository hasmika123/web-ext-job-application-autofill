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
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.ActionResult;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Options;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Page;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Query;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Summary;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.View;
import com.dossier.api.service.ent.mkt.activity.MktActivityService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** The Activities resource without Spring: the routes delegate to the service with the resolved membership, validation answers 400, and every handler is guarded. */
class MktActivityResourceTest {

    private final MktActivityService service = mock(MktActivityService.class);
    private final OrgMembership me = new OrgMembership(1L, 7L, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new MktActivityResource(service)).build();

    private static View emptyView() {
        return new View(
            Instant.parse("2026-10-13T10:00:00Z"), "2026-10-01", "2026-10-31", true, List.of(), new Page(List.of(), 0, 0, 10), new Summary("THIS_MONTH", "2026-10-01", "2026-10-31", 0, List.of()),
            List.of(), 0, new Options(List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of())
        );
    }

    @Test
    void getDelegatesWithTheMembershipAndDefaults() throws Exception {
        when(service.view(eq(me), any(Query.class))).thenReturn(emptyView());
        mvc.perform(get("/api/orgs/1/mkt/activity").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.canLog").value(true)).andExpect(jsonPath("$.from").value("2026-10-01"));
        ArgumentCaptor<Query> q = ArgumentCaptor.forClass(Query.class);
        verify(service).view(eq(me), q.capture());
        assertThat(q.getValue().page()).isZero();
        assertThat(q.getValue().size()).isEqualTo(10);
        assertThat(q.getValue().consultantId()).isNull();
    }

    @Test
    void everyFilterIsForwarded() throws Exception {
        when(service.view(eq(me), any(Query.class))).thenReturn(emptyView());
        mvc.perform(get("/api/orgs/1/mkt/activity?from=2026-10-01&to=2026-10-31&consultantId=11&type=RESUME&status=COMPLETED&clientId=100&ownerId=7&q=tech&sort=oldest&summaryRange=LAST_MONTH&page=2&size=25")
            .requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        verify(service).view(me, new Query("2026-10-01", "2026-10-31", 11L, "RESUME", "COMPLETED", 100L, 7L, "tech", "oldest", "LAST_MONTH", 2, 25));
    }

    @Test
    void writesDelegate() throws Exception {
        when(service.create(eq(me), any())).thenReturn(new ActionResult(null));
        mvc.perform(post("/api/orgs/1/mkt/activity").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON)
            .content("{\"consultantId\":11,\"type\":\"FOLLOWUP_LOGGED\",\"title\":\"Called the recruiter\",\"tags\":\"Client\"}")).andExpect(status().isOk());
        when(service.updateStatus(me, 5L, "CANCELLED")).thenReturn(new ActionResult(null));
        mvc.perform(patch("/api/orgs/1/mkt/activity/5/status").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"CANCELLED\"}")).andExpect(status().isOk());
        verify(service).updateStatus(me, 5L, "CANCELLED");
    }

    @Test
    void invalidBodiesAreRefusedBeforeTheService() throws Exception {
        mvc.perform(post("/api/orgs/1/mkt/activity").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"x\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/orgs/1/mkt/activity").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"consultantId\":1,\"type\":\"RESUME_UPDATED\",\"title\":\"\"}")).andExpect(status().isBadRequest());
        mvc.perform(patch("/api/orgs/1/mkt/activity/5/status").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
    }

    @Test
    void everyHandlerCarriesTheOrgPermissionGuard() {
        int handlers = 0;
        for (Method m : MktActivityResource.class.getDeclaredMethods()) {
            if (m.getDeclaringClass() != MktActivityResource.class || java.lang.reflect.Modifier.isPrivate(m.getModifiers())) continue;
            handlers++;
            assertThat(m.isAnnotationPresent(OrgPermissionRequired.class)).as(m.getName()).isTrue();
        }
        assertThat(handlers).isEqualTo(3);
    }

    @Test
    void thereIsNoRouteThatSubmitsOrSendsAnything() {
        for (Method m : MktActivityResource.class.getDeclaredMethods()) assertThat(m.getName().toLowerCase()).doesNotContain("submit").doesNotContain("email").doesNotContain("send");
    }
}
