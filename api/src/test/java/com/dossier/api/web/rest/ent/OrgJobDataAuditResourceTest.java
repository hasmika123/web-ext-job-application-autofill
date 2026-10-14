package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.jobs.JobDataAuditService;
import com.dossier.api.service.ent.jobs.JobDataAuditService.Event;
import com.dossier.api.service.ent.jobs.JobDataAuditService.Item;
import com.dossier.api.service.ent.jobs.JobDataAuditService.JobProvenance;
import com.dossier.api.service.ent.jobs.JobDataAuditService.Person;
import com.dossier.api.service.ent.jobs.JobDataAuditService.Response;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.errors.ExceptionTranslator;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** The audit route on its own (standalone MockMvc): parameters reach the service, the shape is the contract's, a refusal is the generic 404, and it only reads. */
class OrgJobDataAuditResourceTest {

    JobDataAuditService service = mock(JobDataAuditService.class);
    MockMvc mvc;
    OrgMembership admin = new OrgMembership(7L, 1L, 100L, "admin", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    static final Instant T = Instant.parse("2026-10-14T10:00:00Z");

    @BeforeEach
    void setup() {
        ExceptionTranslator translator = new ExceptionTranslator(new MockEnvironment());
        mvc = MockMvcBuilders.standaloneSetup(new OrgJobDataAuditResource(service)).setControllerAdvice(translator).build();
    }

    static Response sample() {
        JobProvenance job = new JobProvenance(55L, "Senior Java Engineer", "Acme Corp", "EXTENSION", "USER_CLICK", T, new Person(70L, "Maya Lin"), "1.4.2", "f".repeat(64), "MINIMAL", "MINIMAL", T);
        Event captured = new Event(1L, "CAPTURED", T, "EXTENSION", new Person(70L, "Maya Lin"), null, "MINIMAL", "jobUrl,title", "https://example.com/j/1", null, "abc", null);
        return new Response(List.of(new Item(job, List.of(captured))), 1, 0, 25);
    }

    @Test
    void theParametersReachTheServiceAndTheShapeIsTheContracts() throws Exception {
        when(service.jobData(any(), any(), any(), any(), any(), any())).thenReturn(sample());
        mvc.perform(get("/api/orgs/7/audit/job-data?jobId=55&from=2026-10-14T00:00:00Z&to=2026-10-15T00:00:00Z&page=1&size=10").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, admin))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.items[0].job.id").value(55))
            .andExpect(jsonPath("$.items[0].job.title").value("Senior Java Engineer"))
            .andExpect(jsonPath("$.items[0].job.employer").value("Acme Corp"))
            .andExpect(jsonPath("$.items[0].job.captureSource").value("EXTENSION"))
            .andExpect(jsonPath("$.items[0].job.captureMethod").value("USER_CLICK"))
            .andExpect(jsonPath("$.items[0].job.capturedBy.name").value("Maya Lin"))
            .andExpect(jsonPath("$.items[0].job.extensionVersion").value("1.4.2"))
            .andExpect(jsonPath("$.items[0].job.detailLevel").value("MINIMAL"))
            .andExpect(jsonPath("$.items[0].events[0].type").value("CAPTURED"))
            .andExpect(jsonPath("$.items[0].events[0].fields").value("jobUrl,title"));
        verify(service).jobData(admin, 55L, Instant.parse("2026-10-14T00:00:00Z"), Instant.parse("2026-10-15T00:00:00Z"), 1, 10);
    }

    @Test
    void noParametersAreAllowedAndMeanTheFirstPage() throws Exception {
        when(service.jobData(any(), eq(null), eq(null), eq(null), eq(null), eq(null))).thenReturn(sample());
        mvc.perform(get("/api/orgs/7/audit/job-data").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, admin)).andExpect(status().isOk());
    }

    @Test
    void aRefusalIsTheGenericNotFound() throws Exception {
        when(service.jobData(any(), any(), any(), any(), any(), any())).thenThrow(new OrgNotFoundException());
        mvc.perform(get("/api/orgs/7/audit/job-data").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, admin))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void aBadInstantIs400() throws Exception {
        mvc.perform(get("/api/orgs/7/audit/job-data?from=yesterday").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, admin)).andExpect(status().isBadRequest());
    }

    @Test
    void itIsReadOnlyAndDeclaresAuditView() throws Exception {
        mvc.perform(post("/api/orgs/7/audit/job-data").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, admin)).andExpect(status().isMethodNotAllowed());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/orgs/7/audit/job-data").requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, admin)).andExpect(status().isMethodNotAllowed());
        for (Method m : OrgJobDataAuditResource.class.getDeclaredMethods()) {
            if (!java.lang.reflect.Modifier.isPublic(m.getModifiers())) continue;
            OrgPermissionRequired p = m.getAnnotation(OrgPermissionRequired.class);
            assertThat(p).as(m.getName()).isNotNull();
            assertThat(p.value()).containsExactly(OrgPermission.AUDIT_VIEW);
            assertThat(m.isAnnotationPresent(org.springframework.web.bind.annotation.GetMapping.class)).isTrue();
        }
    }
}
