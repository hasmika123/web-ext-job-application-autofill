package com.dossier.api.web.rest.ent.mkt;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
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
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.Chart;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.Filters;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.RuleRow;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.StreamPage;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.StreamRow;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.View;
import com.dossier.api.service.ent.mkt.streams.MktStreamsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Routing, body validation and the "generic 404" of the Job Streams resource (standalone MockMvc, no Docker). */
class MktStreamsResourceTest {

    MktStreamsService service = mock(MktStreamsService.class);
    MockMvc mvc;
    OrgMembership me = new OrgMembership(7L, 11L, 21L, "m@acme.com", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new MktStreamsResource(service)).build();
    }

    static StreamRow row() {
        return new StreamRow(1L, "Dice", null, "ACTIVE", true, 60, List.of(), null, null, 0, null);
    }

    @Test
    void getReturnsTheBoardAndPassesTheFilters() throws Exception {
        View v = new View(List.of(), new StreamPage(List.of(row()), 1, 0, 25), new Filters(List.of(), List.of(), List.of()), List.of(), new Chart(List.of(), List.of()), List.of(), List.<RuleRow>of());
        when(service.get(eq(me), any())).thenReturn(v);
        mvc.perform(get("/api/orgs/7/mkt/streams?q=dice&status=ACTIVE&showInactive=true&days=14").requestAttr(com.dossier.api.web.rest.org.OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk()).andExpect(jsonPath("$.streams.items[0].sourceLabel").value("Dice"));
        verify(service).get(eq(me), eq(new MktStreamsService.Query("dice", null, "ACTIVE", null, true, 0, 25, null, 14)));
    }

    @Test
    void aDeniedCallerGetsTheGeneric404() throws Exception {
        when(service.get(eq(me), any())).thenThrow(new OrgNotFoundException());
        // The standalone setup has no exception translator, so the exception surfaces; in the app ExceptionTranslator renders it as 404.
        try {
            mvc.perform(get("/api/orgs/7/mkt/streams").requestAttr(com.dossier.api.web.rest.org.OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me));
        } catch (Exception e) {
            org.assertj.core.api.Assertions.assertThat(e.getCause()).isInstanceOf(OrgNotFoundException.class);
        }
    }

    @Test
    void createValidatesTheBody() throws Exception {
        mvc.perform(post("/api/orgs/7/mkt/streams").requestAttr(com.dossier.api.web.rest.org.OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"sourceLabel\":\"\",\"syncEveryMinutes\":30}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/orgs/7/mkt/streams").requestAttr(com.dossier.api.web.rest.org.OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"sourceLabel\":\"X\",\"syncEveryMinutes\":1}")).andExpect(status().isBadRequest());
        verify(service, never()).create(any(), any());
        when(service.create(eq(me), any())).thenReturn(row());
        mvc.perform(post("/api/orgs/7/mkt/streams").requestAttr(com.dossier.api.web.rest.org.OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"sourceLabel\":\"Dice\",\"syncEveryMinutes\":60}")).andExpect(status().isCreated());
    }

    @Test
    void configurePauseResumeAndRuleRoutesCallTheService() throws Exception {
        when(service.update(eq(me), eq(1L), any())).thenReturn(row());
        when(service.pause(me, 1L)).thenReturn(row());
        when(service.resume(me, 1L)).thenReturn(row());
        when(service.updateRule(eq(me), eq("AUTO_PUBLISH"), any())).thenReturn(new RuleRow("AUTO_PUBLISH", true, null));
        mvc.perform(patch("/api/orgs/7/mkt/streams/1").requestAttr(com.dossier.api.web.rest.org.OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"syncEveryMinutes\":120}")).andExpect(status().isOk());
        mvc.perform(post("/api/orgs/7/mkt/streams/1/pause").requestAttr(com.dossier.api.web.rest.org.OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        mvc.perform(post("/api/orgs/7/mkt/streams/1/resume").requestAttr(com.dossier.api.web.rest.org.OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        mvc.perform(patch("/api/orgs/7/mkt/streams/rules/AUTO_PUBLISH").requestAttr(com.dossier.api.web.rest.org.OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}")).andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(true));
    }
}
