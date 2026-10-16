package com.dossier.api.service.ent.resumes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.repository.ent.resumes.ResumeShareLinkQueryRepository;
import java.util.List;
import org.junit.jupiter.api.Test;

/** When existing consultant share links are paused: only a resume some organization links into its directory, and only while that organization has sharing off. */
class ConsultantShareLinkPauseTest {

    private final ResumeShareLinkQueryRepository query = mock(ResumeShareLinkQueryRepository.class);
    private final OrgResumePolicy policy = mock(OrgResumePolicy.class);
    private final ConsultantShareLinkPause pause = new ConsultantShareLinkPause(query, policy);

    @Test
    void aResumeNoOrganizationLinksIsNeverPaused() {
        when(query.orgIdsLinking(7L)).thenReturn(List.of());
        assertThat(pause.isPaused(7L)).isFalse();
        assertThat(pause.isPaused(null)).isFalse();
    }

    @Test
    void itFollowsTheLinkingOrganizationsCurrentSetting() {
        when(query.orgIdsLinking(7L)).thenReturn(List.of(3L));
        when(policy.consultantShareLinks(3L)).thenReturn(false);
        assertThat(pause.isPaused(7L)).isTrue();
        when(policy.consultantShareLinks(3L)).thenReturn(true);
        assertThat(pause.isPaused(7L)).as("nothing is stored, so switching back on restores at once").isFalse();
    }

    @Test
    void aResumeLinkedByTwoOrganizationsIsPausedWhenEitherHasSharingOff() {
        when(query.orgIdsLinking(7L)).thenReturn(List.of(3L, 4L));
        when(policy.consultantShareLinks(3L)).thenReturn(true);
        when(policy.consultantShareLinks(4L)).thenReturn(false);
        assertThat(pause.isPaused(7L)).isTrue();
    }

    @Test
    void theLiveShareCountIsTheOrganizationsOwn() {
        when(query.countLiveShares(any(), any())).thenReturn(0L);
        when(query.countLiveShares(org.mockito.ArgumentMatchers.eq(3L), any())).thenReturn(5L);
        assertThat(pause.liveShares(3L)).isEqualTo(5L);
        assertThat(pause.liveShares(4L)).isZero();
    }
}
