package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The first-touch race on {@code bio.ux_bio_user} (found while recording the Gamma videos): a brand-new account's first two profile requests arrive
 * together, both see no bio row and both insert one; the loser used to answer 500. Bio creation is now an idempotent get-or-create, so both requests answer
 * 200 and the account ends with exactly one bio row. Not transactional on purpose: the two requests run on their own threads and connections and commit.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.hikari.maximum-pool-size=6")
class BioFirstTouchRaceIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository users;
    @Autowired private BioRepository bios;
    @Autowired private ResumeRepository resumes;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;

    private final List<Long> created = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        for (Long id : created) {
            try {
                jdbc.update("delete from profile_item where user_id = ?", id);
                bios.findByUserId(id).forEach(bios::delete);
                resumes.findByUserId(id).forEach(resumes::delete);
                users.findById(id).ifPresent(users::delete);
            } catch (RuntimeException ignored) {
                // best effort: the login is unique per run, so a leftover row cannot affect another test
            }
        }
    }

    private User freshUser(String login) {
        User u = new User();
        u.setLogin(login);
        u.setPassword("x".repeat(60));
        u.setActivated(true);
        u.setEmail(login + "@example.com");
        u.setLangKey("en");
        u = users.saveAndFlush(u);
        created.add(u.getId());
        return u;
    }

    @Test
    void twoConcurrentFirstProfileRequestsBothSucceedAndLeaveExactlyOneBio() throws Exception {
        String login = "bio-race-" + System.nanoTime();
        User u = freshUser(login);
        // a default resume is what makes the first profile read seed the profile, and seeding needs the bio row (the creation that raced)
        Resume r = new Resume().label("Main").r2ObjectKey("").status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        r.setUser(u);
        r.setDefaultResume(true);
        r.setParsedJson("{\"experience\":[{\"title\":\"Engineer\",\"company\":\"Acme\",\"startDate\":\"2020\",\"endDate\":\"2022\",\"bullets\":[\"Built things\"]}],\"skills\":[\"Java\"]}");
        resumes.saveAndFlush(r);
        assertThat(bios.findByUserId(u.getId())).isEmpty();

        int callers = 4;
        ExecutorService pool = Executors.newFixedThreadPool(callers);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < callers; i++) {
            results.add(
                pool.submit(() -> {
                    go.await();
                    return mockMvc.perform(get("/api/profile/completeness").with(user(login))).andReturn().getResponse().getStatus();
                })
            );
        }
        go.countDown();
        for (Future<Integer> f : results) assertThat(f.get()).as("no first-touch request may answer 500").isEqualTo(200);
        pool.shutdown();

        assertThat(bios.findByUserId(u.getId())).as("exactly one bio row however the race went").hasSize(1);
    }
}
