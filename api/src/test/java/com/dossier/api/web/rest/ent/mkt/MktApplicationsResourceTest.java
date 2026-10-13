package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.NextActionRequest;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.NoteRequest;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.Query;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.Response;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.Row;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.StageRequest;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.lang.reflect.Method;
import java.time.LocalDate;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.bind.annotation.RequestMapping;

/** The resource is a thin shell: every handler is guarded by {@link OrgPermissionRequired} (fail closed), maps the query as documented and hands the caller's membership to the service. */
class MktApplicationsResourceTest {

    private final MktApplicationsService service = mock(MktApplicationsService.class);
    private final MktApplicationsResource resource = new MktApplicationsResource(service);
    private final OrgMembership me = mock(OrgMembership.class);

    @Test
    void theBaseIsTheMktNamespaceAndEveryHandlerIsGuarded() {
        assertThat(MktApplicationsResource.class.getAnnotation(RequestMapping.class).value()).containsExactly("/api/orgs/{orgId}/mkt/applications");
        long handlers = Arrays.stream(MktApplicationsResource.class.getDeclaredMethods()).filter(m -> java.lang.reflect.Modifier.isPublic(m.getModifiers())).peek(this::guarded).count();
        assertThat(handlers).isEqualTo(5);
    }

    private void guarded(Method m) {
        assertThat(m.isAnnotationPresent(OrgPermissionRequired.class)).as(m.getName()).isTrue();
    }

    @Test
    void getMapsTheBoardQueryAndPassesTheCaller() {
        Response r = new Response(java.util.List.of(), null, null, java.util.List.of(), 0, java.util.List.of(), null);
        when(service.get(eq(me), any(Query.class))).thenReturn(r);
        assertThat(resource.get(me, "java", 4L, 9L, "offer", "6m", "1m", "appliedOn,asc", 2, 20)).isSameAs(r);
        ArgumentCaptor<Query> q = ArgumentCaptor.forClass(Query.class);
        verify(service).get(eq(me), q.capture());
        assertThat(q.getValue()).isEqualTo(new Query("java", 4L, 9L, "offer", "6m", "1m", "appliedOn,asc", 2, 20));
    }

    @Test
    void theFourWritesDelegateToTheirRecordMethodsOnly() {
        Row row = mock(Row.class);
        NoteRequest note = new NoteRequest("hi");
        NextActionRequest next = new NextActionRequest("call", LocalDate.of(2026, 10, 20));
        StageRequest stage = new StageRequest("offer", null);
        when(service.addNote(me, 5L, note)).thenReturn(row);
        when(service.setNextAction(me, 5L, next)).thenReturn(row);
        when(service.markFollowUpDone(me, 5L)).thenReturn(row);
        when(service.recordStage(me, 5L, stage)).thenReturn(row);
        assertThat(resource.addNote(me, 5L, note)).isSameAs(row);
        assertThat(resource.setNextAction(me, 5L, next)).isSameAs(row);
        assertThat(resource.followUpDone(me, 5L)).isSameAs(row);
        assertThat(resource.recordStage(me, 5L, stage)).isSameAs(row);
    }
}
