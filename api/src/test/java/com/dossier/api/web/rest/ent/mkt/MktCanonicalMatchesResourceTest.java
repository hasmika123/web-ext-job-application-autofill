package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.mkt.matches.MktCanonicalMatchesDto;
import com.dossier.api.service.ent.mkt.matches.MktCanonicalMatchesService;
import com.dossier.api.service.ent.pipeline.OrgMatchViews;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.RequestMapping;

class MktCanonicalMatchesResourceTest {

    private final MktCanonicalMatchesService service = mock(MktCanonicalMatchesService.class);
    private final OrgMembership actor = new OrgMembership(1L, 9L, 90L, "sarah", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule()).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        mvc = MockMvcBuilders.standaloneSetup(new MktCanonicalMatchesResource(service)).setMessageConverters(new MappingJackson2HttpMessageConverter(mapper)).build();
    }

    @Test
    void bindsTheDedicatedCanonicalRouteAndLabelsTheResponse() throws Exception {
        OrgMatchViews.Row row = new OrgMatchViews.Row(11L, 7L, 101L, "JOB_POSTING", "Backend Engineer", "Acme", "Remote", null, null, "BOARD_API", 91, "Strong Java fit", "gpt-test", "SUGGESTED_AI", "SUGGESTED", null, null);
        MktCanonicalMatchesDto.Response response = new MktCanonicalMatchesDto.Response("wrong", List.of(row), 1);
        when(service.list(actor, new OrgMatchViews.Query(7L, "SUGGESTED"))).thenReturn(response);

        mvc.perform(
            get("/api/orgs/1/mkt/matches/canonical")
                .param("consultant", "7")
                .param("status", "SUGGESTED")
                .requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, actor)
        )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.source").value("OPPORTUNITY_MATCH"))
            .andExpect(jsonPath("$.items[0].opportunityId").value(101))
            .andExpect(jsonPath("$.total").value(1));

        verify(service).list(actor, new OrgMatchViews.Query(7L, "SUGGESTED"));
    }

    @Test
    void bindsCanonicalDetailAndActionsWithoutUsingTheLegacyResource() throws Exception {
        OrgMatchViews.Row row = new OrgMatchViews.Row(11L, 7L, 101L, "JOB_POSTING", "Backend Engineer", "Acme", "Remote", null, null, "BOARD_API", 91, "Strong Java fit", "gpt-test", "SUGGESTED_AI", "SUGGESTED", null, null);
        when(service.detail(actor, 11L)).thenReturn(row);
        when(service.assign(actor, 11L)).thenReturn(row);
        when(service.dismiss(actor, 11L)).thenReturn(row);

        mvc.perform(get("/api/orgs/1/mkt/matches/canonical/11").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, actor))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(11));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/orgs/1/mkt/matches/canonical/11/assign").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, actor))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(11));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/orgs/1/mkt/matches/canonical/11/dismiss").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, actor))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(11));

        verify(service).detail(actor, 11L);
        verify(service).assign(actor, 11L);
        verify(service).dismiss(actor, 11L);
    }

    @Test
    void exposesCanonicalHandlersUnderTheSourceSpecificPathAndKeepsThePermissionGuard() throws Exception {
        assertThat(MktCanonicalMatchesResource.class.getAnnotation(RequestMapping.class).value()).containsExactly("/api/orgs/{orgId}/mkt/matches/canonical");
        Method list = MktCanonicalMatchesResource.class.getDeclaredMethod("list", OrgMembership.class, Long.class, String.class);
        assertThat(list.isAnnotationPresent(OrgPermissionRequired.class)).isTrue();
        assertThat(MktCanonicalMatchesResource.class.getDeclaredMethods()).allMatch(m -> m.isSynthetic() || m.isAnnotationPresent(OrgPermissionRequired.class));
    }
}
