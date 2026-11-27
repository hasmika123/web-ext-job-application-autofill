package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.ShareScope;
import org.junit.jupiter.api.Test;

class DataShareScopeChangedTest {

    @Test
    void resumeReplayRequiresAnUpwardTransitionToFull() {
        assertThat(new DataShareScopeChanged(1L, 2L, 3L, ShareScope.NONE, ShareScope.FULL).replaysResumes()).isTrue();
        assertThat(new DataShareScopeChanged(1L, 2L, 3L, ShareScope.SUMMARY, ShareScope.FULL).replaysResumes()).isTrue();
        assertThat(new DataShareScopeChanged(1L, 2L, 3L, ShareScope.NONE, ShareScope.SUMMARY).replaysResumes()).isFalse();
        assertThat(new DataShareScopeChanged(1L, 2L, 3L, ShareScope.FULL, ShareScope.SUMMARY).replaysResumes()).isFalse();
        assertThat(new DataShareScopeChanged(null, 2L, 3L, ShareScope.NONE, ShareScope.FULL).replaysResumes()).isFalse();
    }
}
