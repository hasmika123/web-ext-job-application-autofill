package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.lang.reflect.Method;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.web.bind.annotation.RequestMapping;

/** The thin resource: every handler is behind the org gate, the query maps one to one, and each write delegates exactly one service call. */
class MktInterviewsResourceTest {

    private final MktInterviewsService service = mock(MktInterviewsService.class);
    private final MktInterviewsResource resource = new MktInterviewsResource(service);
    private final OrgMembership me = new OrgMembership(1L, 7L, 70L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @Test
    void everyHandlerCarriesTheOrgGate() {
        List<String> missing = new ArrayList<>();
        for (Method m : MktInterviewsResource.class.getDeclaredMethods()) {
            if (AnnotatedElementUtils.hasAnnotation(m, RequestMapping.class) && !m.isAnnotationPresent(OrgPermissionRequired.class)) missing.add(m.getName());
        }
        assertThat(missing).isEmpty();
    }

    @Test
    void overviewPassesTheFiltersThrough() {
        MktInterviewsDto.Overview empty = new MktInterviewsDto.Overview(Instant.EPOCH, List.of(), null, List.of(), List.of(), null, List.of(), List.of());
        when(service.overview(eq(me), any())).thenReturn(empty);
        assertThat(resource.overview(me, LocalDate.parse("2026-10-11"), LocalDate.parse("2026-10-17"), "CONFIRMED", 9L, "alex", "client", "desc", 2, 10, -480)).isSameAs(empty);
        ArgumentCaptor<MktInterviewsDto.Query> q = ArgumentCaptor.forClass(MktInterviewsDto.Query.class);
        verify(service).overview(eq(me), q.capture());
        assertThat(q.getValue()).isEqualTo(new MktInterviewsDto.Query(LocalDate.parse("2026-10-11"), LocalDate.parse("2026-10-17"), "CONFIRMED", 9L, "alex", "client", "desc", 2, 10, -480));
    }

    @Test
    void writesDelegateOneCallEach() {
        resource.reschedule(me, 5L, new MktInterviewsDto.RescheduleRequest(Instant.parse("2026-10-20T10:00:00Z"), "n"));
        verify(service).proposeReschedule(eq(me), eq(5L), any());
        resource.confirm(me, 5L);
        verify(service).confirmSlot(me, 5L);
        resource.feedback(me, 5L, new MktInterviewsDto.FeedbackRequest("PASSED", "ok"));
        verify(service).recordFeedback(eq(me), eq(5L), any());
        resource.remind(me, 5L);
        verify(service).requestReminder(me, 5L);
        resource.tick(me, 5L, 9L, new MktInterviewsDto.PrepTickRequest(true));
        verify(service).tick(me, 5L, 9L, true);
        resource.prep(me, 5L);
        verify(service).checklist(me, 5L);
    }
}
