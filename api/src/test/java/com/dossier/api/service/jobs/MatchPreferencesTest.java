package com.dossier.api.service.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.jobs.MatchPreferences.Seniority;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/** A user's match preferences, read from what they already gave us (Phase 13.6b). */
class MatchPreferencesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 22);

    private static final String RESUME =
        "{\"skills\":[\"Java\",\"Kafka\",\"PostgreSQL\",\"AWS\"],\"experience\":[" +
        "{\"title\":\"Senior Backend Engineer\",\"company\":\"Globex\",\"startDate\":\"Jan 2022\",\"current\":true}," +
        "{\"title\":\"Software Engineer\",\"company\":\"Initech\",\"startDate\":\"2019-06\",\"endDate\":\"2022-03\"}," +
        "{\"title\":\"Intern\",\"company\":\"Hooli\",\"startDate\":\"2018\",\"endDate\":\"2018\"}]}";

    @Test
    void readsTheProfileAndTheResume() {
        MatchPreferences p = MatchPreferences.from(
            "{\"city\":\"Brooklyn\",\"state\":\"NY\",\"country\":\"United States\",\"workPreference\":\"Remote\"," +
            "\"willingToRelocate\":\"No\",\"requireSponsorship\":\"Yes\",\"gender\":\"never read\"}",
            RESUME,
            TODAY
        );
        assertThat(p.titles()).containsExactly("Senior Backend Engineer", "Software Engineer");
        assertThat(p.seniority()).isEqualTo(Seniority.SENIOR);
        assertThat(p.skills()).containsExactly("Java", "Kafka", "PostgreSQL", "AWS");
        assertThat(p.years()).isEqualTo(7); // Jun 2019 → Sep 2026, with the overlap counted once; 2018's zero-length intern role adds nothing
        assertThat(p.city()).isEqualTo("Brooklyn");
        assertThat(p.workPreference()).isEqualTo("REMOTE");
        assertThat(p.relocate()).isFalse();
        assertThat(p.needsSponsorship()).isTrue();
        assertThat(p.usable()).isTrue();
    }

    @Test
    void anEmptyProfileStillWorksAndNoResumeIsUnusable() {
        MatchPreferences p = MatchPreferences.from(null, "{}", TODAY);
        assertThat(p.usable()).isFalse();
        assertThat(p.city()).isNull();
        assertThat(p.workPreference()).isNull();
        assertThat(p.seniority()).isEqualTo(Seniority.UNKNOWN);
    }

    @Test
    void seniorityReadsTheTitle() {
        assertThat(Seniority.of("Staff Software Engineer")).isEqualTo(Seniority.STAFF);
        assertThat(Seniority.of("Software Engineer II")).isEqualTo(Seniority.MID);
        assertThat(Seniority.of("Engineering Intern, Summer 2027")).isEqualTo(Seniority.INTERN);
        assertThat(Seniority.of("Director of Engineering")).isEqualTo(Seniority.EXECUTIVE);
        assertThat(Seniority.of("Head of Design")).isEqualTo(Seniority.EXECUTIVE);
        assertThat(Seniority.of("Junior Data Analyst")).isEqualTo(Seniority.JUNIOR);
        assertThat(Seniority.of("Product Designer")).isEqualTo(Seniority.UNKNOWN);
    }

    @Test
    void withoutATitleLevelSeniorityComesFromYears() {
        MatchPreferences p = MatchPreferences.from(
            null,
            "{\"experience\":[{\"title\":\"Product Designer\",\"startDate\":\"2020\",\"current\":true}]}",
            TODAY
        );
        assertThat(p.years()).isEqualTo(6);
        assertThat(p.seniority()).isEqualTo(Seniority.SENIOR);
    }

    @Test
    void workPreferenceSpellings() {
        assertThat(MatchPreferences.workPreference("On-site")).isEqualTo("ONSITE");
        assertThat(MatchPreferences.workPreference("Hybrid")).isEqualTo("HYBRID");
        assertThat(MatchPreferences.workPreference("")).isNull();
    }
}
