package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.mkt.home.MktHomeDto;
import com.dossier.api.service.ent.mkt.home.MktHomeService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** The Home resource without Spring: one read route that delegates with the resolved membership, is guarded, and offers no write. */
class MktHomeResourceTest {

    private final MktHomeService service = mock(MktHomeService.class);
    private final OrgMembership me = new OrgMembership(1L, 7L, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new MktHomeResource(service)).setControllerAdvice(new Advice()).build();

    @org.springframework.web.bind.annotation.RestControllerAdvice
    static class Advice {
        @org.springframework.web.bind.annotation.ExceptionHandler(OrgNotFoundException.class)
        @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NOT_FOUND)
        void notFound() {}
    }

    @Test
    void getDelegatesWithTheMembershipAndReturnsTheBoardJson() throws Exception {
        when(service.home(me)).thenReturn(new MktHomeDto.View(
            List.of(new MktHomeDto.Kpi("assigned", 28, 12.0, List.of(1L, 2L))), List.of(), List.of(), List.of(), null, List.of(), List.of(), List.of()
        ));
        mvc.perform(get("/api/orgs/1/mkt/home").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.kpis[0].key").value("assigned"))
            .andExpect(jsonPath("$.kpis[0].value").value(28))
            .andExpect(jsonPath("$.kpis[0].deltaPct").value(12.0))
            .andExpect(jsonPath("$.talent").isEmpty())
            .andExpect(jsonPath("$.pipeline").doesNotExist());
        verify(service).home(me);
    }

    @Test
    void theNotFoundGateIsA404() throws Exception {
        when(service.home(me)).thenThrow(new OrgNotFoundException());
        mvc.perform(get("/api/orgs/1/mkt/home").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isNotFound());
    }

    @Test
    void thereIsNoWriteRoute() throws Exception {
        mvc.perform(post("/api/orgs/1/mkt/home").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me)).andExpect(status().isMethodNotAllowed());
    }

    @Test
    void everyHandlerIsGuarded() {
        for (Method m : MktHomeResource.class.getDeclaredMethods()) if (!m.isSynthetic()) assertThat(m.isAnnotationPresent(OrgPermissionRequired.class)).as(m.getName()).isTrue();
    }
}
