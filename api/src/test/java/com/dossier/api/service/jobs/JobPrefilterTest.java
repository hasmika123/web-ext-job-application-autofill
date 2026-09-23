package com.dossier.api.service.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.JobPosting;
import com.dossier.api.service.jobs.MatchPreferences.Seniority;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

/** Which fresh postings are worth scoring for one user (Phase 13.6b). */
class JobPrefilterTest {

    private static final AtomicLong IDS = new AtomicLong();

    private static MatchPreferences prefs(String city, String state, String country, String work, boolean relocate) {
        return new MatchPreferences(
            List.of("Senior Backend Engineer"),
            Seniority.SENIOR,
            7,
            List.of("Java", "Kafka", "PostgreSQL", "AWS", "Terraform", "Spring Boot", "gRPC"),
            city,
            state,
            country,
            work,
            relocate,
            false
        );
    }

    private static final MatchPreferences NYC_REMOTE = prefs("Brooklyn", "NY", "United States", "REMOTE", false);

    private static JobPosting job(String title, String location, Boolean remote, String description) {
        JobPosting j = new JobPosting() {
            private final Long id = IDS.incrementAndGet();

            @Override
            public Long getId() {
                return id;
            }
        };
        j.setTitle(title);
        j.setCompany("Acme");
        j.setLocation(location);
        j.setRemote(remote);
        j.setUrl("https://jobs.example/" + title.hashCode() + "/" + location);
        j.setDescriptionText(description);
        j.setPublishedAt(Instant.parse("2026-09-21T12:00:00Z"));
        return j;
    }

    private static List<String> titles(MatchPreferences p, List<JobPosting> jobs) {
        return JobPrefilter.select(p, jobs, Set.of(), Set.of(), 50).stream().map(c -> c.posting().getTitle() + " @ " + c.posting().getLocation()).toList();
    }

    @Test
    void remoteInTheirCountryPassesRemoteElsewhereDoesNot() {
        List<JobPosting> jobs = List.of(
            job("Backend Engineer", "Remote (US)", true, "Java and Kafka"),
            job("Backend Engineer", "Remote (Canada)", true, "Java and Kafka"),
            job("Backend Engineer", "Remote - EMEA", true, "Java and Kafka"),
            job("Backend Engineer", "Remote", true, "Java and Kafka"),
            job("Backend Engineer", "Berlin, Germany", null, "Java and Kafka"),
            job("Backend Engineer", "New York, NY (HQ)", null, "Java and Kafka"),
            job("Backend Engineer", "Austin, TX", null, "Java and Kafka")
        );
        assertThat(titles(NYC_REMOTE, jobs)).containsExactlyInAnyOrder(
            "Backend Engineer @ Remote (US)",
            "Backend Engineer @ Remote",
            "Backend Engineer @ New York, NY (HQ)"
        );
    }

    @Test
    void relocationOpensTheirWholeCountry() {
        List<JobPosting> jobs = List.of(job("Backend Engineer", "Austin, TX", null, "Java"), job("Backend Engineer", "London, UK", null, "Java"));
        assertThat(titles(prefs("Brooklyn", "NY", "United States", "ONSITE", true), jobs)).containsExactly("Backend Engineer @ Austin, TX");
    }

    @Test
    void anyOneLocationIsEnough() {
        List<JobPosting> jobs = List.of(job("Backend Platform Engineer", "San Francisco, CA; Remote (US)", true, "Kafka"));
        assertThat(titles(NYC_REMOTE, jobs)).hasSize(1);
    }

    @Test
    void noLocationOnTheProfileMeansAnywhere() {
        List<JobPosting> jobs = List.of(job("Backend Engineer", "Tokyo, Japan", null, "Java"));
        assertThat(titles(prefs(null, null, null, null, false), jobs)).hasSize(1);
    }

    @Test
    void theLineOfWorkMustMatch() {
        List<JobPosting> jobs = List.of(
            job("Backend Engineer", "Remote (US)", true, ""),
            job("Account Executive", "Remote (US)", true, "Sell our Java platform"),
            job("Backend Developer", "Remote (US)", true, ""), // "developer" counts as "engineer"
            job("Technical Support Engineer", "Remote (US)", true, "Help customers with Java"), // only "engineer" in common
            job("Solutions Engineer", "Remote (US)", true, "Java, Kafka and AWS integrations"), // "engineer" + three skills
            job("Data Platform Specialist", "Remote (US)", true, "Java, Kafka, PostgreSQL, AWS, Terraform, Spring Boot")
        );
        assertThat(titles(NYC_REMOTE, jobs)).containsExactlyInAnyOrder(
            "Backend Engineer @ Remote (US)",
            "Backend Developer @ Remote (US)",
            "Solutions Engineer @ Remote (US)",
            "Data Platform Specialist @ Remote (US)"
        );
    }

    @Test
    void levelsTwoOrMoreAwayAreLeftOut() {
        List<JobPosting> jobs = List.of(
            job("Backend Engineering Intern", "Remote (US)", true, "Java"),
            job("Director, Backend Engineering", "Remote (US)", true, "Java"),
            job("Staff Backend Engineer", "Remote (US)", true, "Java"),
            job("Backend Engineer II", "Remote (US)", true, "Java")
        );
        assertThat(titles(NYC_REMOTE, jobs)).containsExactlyInAnyOrder("Staff Backend Engineer @ Remote (US)", "Backend Engineer II @ Remote (US)");
    }

    @Test
    void seenAndTrackedJobsAreLeftOut() {
        JobPosting seen = job("Backend Engineer", "Remote (US)", true, "Java");
        JobPosting tracked = job("Senior Backend Engineer", "Remote (US)", true, "Java");
        JobPosting fresh = job("Backend Engineer, Payments", "Remote (US)", true, "Java");
        List<JobPrefilter.Candidate> out = JobPrefilter.select(
            NYC_REMOTE,
            List.of(seen, tracked, fresh),
            Set.of(seen.getId()),
            Set.of(JobPrefilter.trackedKey("ACME", "Senior Backend Engineer")),
            50
        );
        assertThat(out).extracting(c -> c.posting().getTitle()).containsExactly("Backend Engineer, Payments");
    }

    @Test
    void theBestFiftyAreKeptBestFirst() {
        List<JobPosting> jobs = new ArrayList<>();
        for (int i = 0; i < 60; i++) jobs.add(job("Backend Engineer " + (100 + i), "Remote (US)", true, "Java"));
        JobPosting best = job("Senior Backend Engineer", "Brooklyn, NY", null, "Java Kafka PostgreSQL AWS Terraform");
        jobs.add(best);
        List<JobPrefilter.Candidate> out = JobPrefilter.select(NYC_REMOTE, jobs, Set.of(), Set.of(), 50);
        assertThat(out).hasSize(50);
        assertThat(out.get(0).posting()).isSameAs(best);
    }

    @Test
    void aHybridJobFlaggedRemoteIsNotRemote() {
        JobPosting sf = job("Backend Engineer", "San Francisco, California", true, "Java");
        sf.setWorkplaceType("HYBRID"); // how Ashby sends OpenAI's and Sentry's SF jobs
        assertThat(titles(NYC_REMOTE, List.of(sf))).isEmpty();
    }

    @Test
    void titleWordsIgnoreLevelsAndTreatDeveloperAsEngineer() {
        assertThat(JobPrefilter.words("Sr. Front-End Developer II")).containsExactlyInAnyOrder("frontend", "engineer");
    }
}
