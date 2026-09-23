package com.dossier.api.service.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Reading the board out of a job link (Phase 13.6a) — how users' companies join the pool. */
class JobBoardUrlsTest {

    private static JobBoardUrls.Board board(String url) {
        return JobBoardUrls.parse(url).orElse(null);
    }

    @Test
    void hostedBoardLinksNameTheirBoard() {
        assertThat(board("https://boards.greenhouse.io/acme/jobs/4012345")).isEqualTo(new JobBoardUrls.Board("greenhouse", "acme"));
        assertThat(board("https://job-boards.greenhouse.io/acme-co/jobs/4012345?gh_src=x")).isEqualTo(new JobBoardUrls.Board("greenhouse", "acme-co"));
        assertThat(board("https://boards.greenhouse.io/embed/job_app?for=acme&token=4012345")).isEqualTo(new JobBoardUrls.Board("greenhouse", "acme"));
        assertThat(board("https://jobs.lever.co/palantir/ac978161-6f46/apply")).isEqualTo(new JobBoardUrls.Board("lever", "palantir"));
        assertThat(board("https://jobs.ashbyhq.com/ramp/34413f8d/application")).isEqualTo(new JobBoardUrls.Board("ashby", "ramp"));
    }

    @Test
    void linksWithoutABoardAreSkipped() {
        assertThat(board("https://stripe.com/jobs/search?gh_jid=8172508")).isNull(); // company careers page
        assertThat(board("https://job-boards.eu.greenhouse.io/acme/jobs/1")).isNull(); // EU API host, not read
        assertThat(board("https://jobs.eu.lever.co/acme/1")).isNull();
        assertThat(board("https://boards.greenhouse.io/embed/job_app?token=1")).isNull();
        assertThat(board("https://jobs.lever.co/")).isNull();
        assertThat(board("not a url")).isNull();
        assertThat(board(null)).isNull();
    }
}
