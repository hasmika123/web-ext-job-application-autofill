package com.dossier.api.service.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.JobSource;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.repository.JobSourceRepository;
import com.dossier.api.service.AdminAuditService;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

/** The pool of boards (Phase 13.6a): the seed file, discovery from applications, admin adds. */
class JobSourceServiceTest {

    private JobSourceRepository sources;
    private ApplicationRepository applications;
    private JobBoardClient client;
    private JobSourceService service;
    private final List<JobSource> saved = new ArrayList<>();

    @BeforeEach
    void setUp() {
        sources = mock(JobSourceRepository.class);
        applications = mock(ApplicationRepository.class);
        client = mock(JobBoardClient.class);
        when(sources.findOneByAtsAndBoardTokenIgnoreCase(anyString(), anyString())).thenReturn(Optional.empty());
        when(sources.save(any(JobSource.class))).thenAnswer(inv -> {
            saved.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        service = new JobSourceService(sources, mock(JobPostingRepository.class), applications, client, mock(AdminAuditService.class));
    }

    @Test
    void theSeedFileIsWellFormedAndHasNoRepeats() {
        List<String[]> rows = JobSourceService.readSeedFile();
        assertThat(rows).hasSizeGreaterThanOrEqualTo(200);
        Set<String> boards = new HashSet<>();
        for (String[] r : rows) {
            assertThat(JobBoardParsers.ATS).contains(r[0]);
            assertThat(boards.add(r[0] + "/" + r[1].toLowerCase())).as("repeated board %s/%s", r[0], r[1]).isTrue();
        }
    }

    @Test
    void seedingAddsOnlyWhatIsMissing() {
        when(sources.findOneByAtsAndBoardTokenIgnoreCase("greenhouse", "stripe")).thenReturn(Optional.of(new JobSource()));
        int added = service.syncSeeds();
        assertThat(added).isEqualTo(JobSourceService.readSeedFile().size() - 1);
        assertThat(saved).allMatch(s -> JobSource.SEED.equals(s.getOrigin()));
        assertThat(saved).noneMatch(s -> s.getBoardToken().equals("stripe") && s.getAts().equals("greenhouse"));
    }

    @Test
    void companiesUsersApplyToJoinThePool() {
        when(applications.findJobBoardLinks()).thenReturn(
            List.of(
                new Object[] { "https://jobs.lever.co/newco/abc", "NewCo " },
                new Object[] { "https://stripe.com/jobs/search?gh_jid=1", "Stripe" }, // no board in the link
                new Object[] { "https://jobs.ashbyhq.com/quietco/xyz", null }
            )
        );
        assertThat(service.discoverFromApplications()).isEqualTo(2);
        assertThat(saved).extracting(JobSource::getBoardToken).containsExactly("newco", "quietco");
        assertThat(saved).extracting(JobSource::getCompanyName).containsExactly("NewCo", "quietco");
        assertThat(saved).allMatch(s -> JobSource.DISCOVERED.equals(s.getOrigin()));
    }

    @Test
    void anAdminAddIsCheckedLiveFirst() throws Exception {
        when(client.fetch(any(), any(), any(), any())).thenReturn(new JobBoardClient.Result(12, List.of()));
        JobSourceService.SourceView v = service.add(" Lever ", "newco", "NewCo");
        assertThat(v.ats()).isEqualTo("lever");
        assertThat(v.origin()).isEqualTo(JobSource.ADMIN);
        assertThat(v.lastJobCount()).isEqualTo(12);
    }

    @Test
    void aBadAdminAddIsRefused() throws Exception {
        assertThatThrownBy(() -> service.add("workday", "x", "X")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.add("lever", "a/b", "X")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.add("lever", "x", " ")).isInstanceOf(ResponseStatusException.class);
        when(client.fetch(any(), any(), any(), any())).thenThrow(new JobBoardClient.BoardException("Board not found (404)", true));
        assertThatThrownBy(() -> service.add("lever", "typo", "X")).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        verify(sources, never()).save(any());
    }
}
