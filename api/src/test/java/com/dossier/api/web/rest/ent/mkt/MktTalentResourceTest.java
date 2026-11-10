package com.dossier.api.web.rest.ent.mkt;

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

import com.dossier.api.service.ent.mkt.talent.MktTalentDtos.*;
import com.dossier.api.service.ent.mkt.talent.MktTalentService;
import com.dossier.api.service.ent.mkt.talent.MktTalentService.ListQuery;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** The resource of My Assigned Talent without Spring: routes, parameters and status codes. Scope and rules are the service's (see MktTalentServiceTest). */
class MktTalentResourceTest {

    MktTalentService service;
    OrgMembership me;
    MockMvc mvc;

    /** The first Mockito inline mock and the first Spring MVC setup of a JVM can be slow on a busy machine; the @BeforeAll budget is 60 s, a test's is 15 s. */
    @BeforeAll
    static void warmUpMockito() {
        mock(OrgMembership.class);
        MockMvcBuilders.standaloneSetup(new MktTalentResource(mock(MktTalentService.class))).setControllerAdvice(new Advice()).build(); // loads Spring MVC once
    }

    @BeforeEach
    void setUp() {
        service = mock(MktTalentService.class);
        me = mock(OrgMembership.class);
        mvc = MockMvcBuilders.standaloneSetup(new MktTalentResource(service)).setControllerAdvice(new Advice()).build();
    }

    /** Stands in for the API's exception translator: the generic 404. */
    @org.springframework.web.bind.annotation.RestControllerAdvice
    static class Advice {
        @org.springframework.web.bind.annotation.ExceptionHandler(OrgNotFoundException.class)
        @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NOT_FOUND)
        void notFound() {}
    }

    @Test
    void listPassesTheBoardsFiltersAndPaging() throws Exception {
        Response empty = new Response(List.of(), new Counts(0, 0, 0, 0, 0), new Facets(List.of(), List.of()), List.of(), 0, 0, 8, new Cards(List.of(), List.of(), List.of()), List.of(), false);
        when(service.list(eq(me), any())).thenReturn(empty);
        mvc.perform(get("/api/orgs/7/mkt/talent").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)
                .param("q", "java").param("status", "NEEDS_UPDATE").param("skill", "Java").param("location", "Remote").param("experience", "6-8").param("availability", "SOON").param("sort", "-experience").param("page", "2").param("size", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(0))
            .andExpect(jsonPath("$.canAddConsultant").value(false));
        ArgumentCaptor<ListQuery> q = ArgumentCaptor.forClass(ListQuery.class);
        verify(service).list(eq(me), q.capture());
        org.assertj.core.api.Assertions.assertThat(q.getValue()).isEqualTo(new ListQuery("java", "NEEDS_UPDATE", "Java", "Remote", "6-8", "SOON", "-experience", 2, 20));
    }

    @Test
    void listDefaultsToThePageOfEight() throws Exception {
        when(service.list(eq(me), any())).thenReturn(new Response(List.of(), new Counts(0, 0, 0, 0, 0), new Facets(List.of(), List.of()), List.of(), 0, 0, 8, new Cards(List.of(), List.of(), List.of()), List.of(), false));
        mvc.perform(get("/api/orgs/7/mkt/talent").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isOk());
        ArgumentCaptor<ListQuery> q = ArgumentCaptor.forClass(ListQuery.class);
        verify(service).list(eq(me), q.capture());
        org.assertj.core.api.Assertions.assertThat(q.getValue().size()).isEqualTo(8);
        org.assertj.core.api.Assertions.assertThat(q.getValue().page()).isZero();
    }

    @Test
    void aConsultantOutsideTheScopeIsAGenericNotFound() throws Exception {
        when(service.detail(me, 99L)).thenThrow(new OrgNotFoundException());
        mvc.perform(get("/api/orgs/7/mkt/talent/99").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isNotFound());
    }

    @Test
    void savingAViewIs201AndDeletingIs204() throws Exception {
        when(service.saveView(eq(me), any())).thenReturn(new View(4L, "Mine", new Filters(null, "NEEDS_UPDATE", null, null, null, null)));
        mvc.perform(post("/api/orgs/7/mkt/talent/views").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me).contentType("application/json").content("{\"name\":\"Mine\",\"status\":\"NEEDS_UPDATE\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(4))
            .andExpect(jsonPath("$.filters.status").value("NEEDS_UPDATE"));
        mvc.perform(delete("/api/orgs/7/mkt/talent/views/4").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isNoContent());
        verify(service).deleteView(me, 4L);
    }

    @Test
    void thereIsNoWriteRouteForConsultantsSoNothingCanSubmitForThem() throws Exception {
        mvc.perform(post("/api/orgs/7/mkt/talent/1").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isMethodNotAllowed());
        mvc.perform(delete("/api/orgs/7/mkt/talent/1").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isMethodNotAllowed());
    }
}
