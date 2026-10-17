package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto;
import com.dossier.api.service.ent.mkt.matches.MktMatchesService;
import com.dossier.api.service.ent.pipeline.DuplicateGuard;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.RequestMapping;

/** The thin resource: it passes the resolved membership and the board's filters straight to the service, and offers nothing that submits. */
class MktMatchesResourceTest {

    private final MktMatchesService service = mock(MktMatchesService.class);
    private final MktMatchesResource resource = new MktMatchesResource(service);
    private final OrgMembership me = new OrgMembership(1L, 7L, 70L, "sarah", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @Test
    void listPassesTheFiltersAndTheCaller() {
        MktMatchesDto.Response empty = new MktMatchesDto.Response(List.of(), null, List.of(), 0, 0, 10, List.of(), null, 85, 7);
        when(service.list(any(), any())).thenReturn(empty);
        assertThat(resource.list(me, 2, 25, "java", 5L, "Java", 9L, "high", "-score", 3L)).isSameAs(empty);
        verify(service).list(me, new MktMatchesService.Query(2, 25, "java", 5L, "Java", 9L, "high", "-score", 3L));
    }

    @Test
    void assignDismissCompareAndDetailDelegate() {
        resource.assign(me, 4L, null);
        resource.dismiss(me, 5L);
        resource.compare(me, 1L, 2L);
        resource.get(me, 6L);
        verify(service).assign(me, 4L, DuplicateGuard.Confirm.NONE);
        verify(service).dismiss(me, 5L);
        verify(service).compare(me, 1L, 2L);
        verify(service).detail(me, 6L);
    }

    @Test
    void assignPassesTheAnswerToADuplicateWarning() {
        resource.assign(me, 4L, new MktMatchesDto.AssignRequest(true, "The client asked for both"));
        verify(service).assign(me, 4L, DuplicateGuard.Confirm.of(true, "The client asked for both"));
        resource.assign(me, 5L, new MktMatchesDto.AssignRequest(null, "ignored without the flag"));
        verify(service).assign(me, 5L, DuplicateGuard.Confirm.of(null, "ignored without the flag"));
    }

    @Test
    void everyHandlerIsGuardedAndNoneIsNamedLikeASubmission() {
        assertThat(MktMatchesResource.class.getAnnotation(RequestMapping.class).value()).containsExactly("/api/orgs/{orgId}/mkt/matches");
        for (Method m : MktMatchesResource.class.getDeclaredMethods()) {
            if (m.isSynthetic()) continue; // coverage instrumentation adds one
            assertThat(m.isAnnotationPresent(OrgPermissionRequired.class)).as(m.getName()).isTrue();
            assertThat(m.getName().toLowerCase()).doesNotContain("submit").doesNotContain("send").doesNotContain("apply");
        }
    }
}
