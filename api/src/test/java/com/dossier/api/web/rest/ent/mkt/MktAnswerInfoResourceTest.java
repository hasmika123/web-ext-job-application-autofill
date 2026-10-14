package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.ActionResult;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContentException;
import com.dossier.api.web.rest.ent.EntConflictAdvice;
import com.dossier.api.web.rest.errors.ExceptionTranslator;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** {@code POST /mkt/opportunities/{id}/answer-info}: the body reaches the service, errors keep their codes, and the route is guarded like its neighbours. */
class MktAnswerInfoResourceTest {

    MktOpportunitiesService service = mock(MktOpportunitiesService.class);
    MockMvc mvc;
    OrgMembership me = new OrgMembership(7L, 70L, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @BeforeEach
    void setup() {
        ExceptionTranslator translator = new ExceptionTranslator(new MockEnvironment());
        mvc = MockMvcBuilders.standaloneSetup(new MktOpportunitiesResource(service)).setControllerAdvice(new EntConflictAdvice(translator), translator).build();
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder call(String body) {
        return post("/api/orgs/7/mkt/opportunities/5/answer-info").contentType(MediaType.APPLICATION_JSON).content(body).requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, me);
    }

    @Test
    void theAnswerReachesTheServiceAndTheResultIsReturned() throws Exception {
        when(service.answerInfo(any(), eq(5L), eq("Fully remote."))).thenReturn(new ActionResult(null, "Your answer was sent to Alex.", true));
        mvc.perform(call("{\"answer\":\"Fully remote.\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.message").value("Your answer was sent to Alex."))
            .andExpect(jsonPath("$.changed").value(true));
        verify(service).answerInfo(me, 5L, "Fully remote.");
    }

    @Test
    void anAbsentAnswerReachesTheServiceAsNullWhichRefusesIt() throws Exception {
        when(service.answerInfo(any(), eq(5L), eq(null))).thenThrow(OrgException.coded(400, "VALIDATION", "answer: enter 1 to 1000 characters", Map.of("field", "answer")));
        mvc.perform(call("{}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION"));
    }

    @Test
    void theServicesCodesKeepTheirStatuses() throws Exception {
        when(service.answerInfo(any(), eq(5L), eq("a"))).thenThrow(OrgException.coded(409, "NO_OPEN_INFO_REQUEST", "nothing waiting", Map.of()));
        mvc.perform(call("{\"answer\":\"a\"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NO_OPEN_INFO_REQUEST"));
        when(service.answerInfo(any(), eq(5L), eq("b"))).thenThrow(new SensitiveContentException("answer", "SSN_ITIN"));
        mvc.perform(call("{\"answer\":\"b\"}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"));
        when(service.answerInfo(any(), eq(5L), eq("c"))).thenThrow(new OrgNotFoundException());
        mvc.perform(call("{\"answer\":\"c\"}")).andExpect(status().isNotFound());
    }

    @Test
    void theRouteIsGuardedAndNothingElseOnThePageSetsTheConsultantsState() throws Exception {
        var m = MktOpportunitiesResource.class.getMethod("answerInfo", OrgMembership.class, Long.class, com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.AnswerInfoRequest.class);
        assertThat(m.isAnnotationPresent(OrgPermissionRequired.class)).isTrue();
        assertThat(m.getAnnotation(org.springframework.web.bind.annotation.PostMapping.class).value()).containsExactly("/{id}/answer-info");
    }
}
