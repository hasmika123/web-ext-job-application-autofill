package com.dossier.api.service.criteria;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Objects;
import java.util.function.BiFunction;
import java.util.function.Function;
import org.assertj.core.api.Condition;
import org.junit.jupiter.api.Test;

class ApplicationCriteriaTest {

    @Test
    void newApplicationCriteriaHasAllFiltersNullTest() {
        var applicationCriteria = new ApplicationCriteria();
        assertThat(applicationCriteria).is(criteriaFiltersAre(Objects::isNull));
    }

    @Test
    void applicationCriteriaFluentMethodsCreatesFiltersTest() {
        var applicationCriteria = new ApplicationCriteria();

        setAllFilters(applicationCriteria);

        assertThat(applicationCriteria).is(criteriaFiltersAre(Objects::nonNull));
    }

    @Test
    void applicationCriteriaCopyCreatesNullFilterTest() {
        var applicationCriteria = new ApplicationCriteria();
        var copy = applicationCriteria.copy();

        assertThat(applicationCriteria).satisfies(
            criteria ->
                assertThat(criteria).is(
                    copyFiltersAre(copy, (a, b) -> (a == null || a instanceof Boolean) ? a == b : (a != b && a.equals(b)))
                ),
            criteria -> assertThat(criteria).isEqualTo(copy),
            criteria -> assertThat(criteria).hasSameHashCodeAs(copy)
        );

        assertThat(copy).satisfies(
            criteria -> assertThat(criteria).is(criteriaFiltersAre(Objects::isNull)),
            criteria -> assertThat(criteria).isEqualTo(applicationCriteria)
        );
    }

    @Test
    void applicationCriteriaCopyDuplicatesEveryExistingFilterTest() {
        var applicationCriteria = new ApplicationCriteria();
        setAllFilters(applicationCriteria);

        var copy = applicationCriteria.copy();

        assertThat(applicationCriteria).satisfies(
            criteria ->
                assertThat(criteria).is(
                    copyFiltersAre(copy, (a, b) -> (a == null || a instanceof Boolean) ? a == b : (a != b && a.equals(b)))
                ),
            criteria -> assertThat(criteria).isEqualTo(copy),
            criteria -> assertThat(criteria).hasSameHashCodeAs(copy)
        );

        assertThat(copy).satisfies(
            criteria -> assertThat(criteria).is(criteriaFiltersAre(Objects::nonNull)),
            criteria -> assertThat(criteria).isEqualTo(applicationCriteria)
        );
    }

    @Test
    void toStringVerifier() {
        var applicationCriteria = new ApplicationCriteria();

        assertThat(applicationCriteria).hasToString("ApplicationCriteria{}");
    }

    private static void setAllFilters(ApplicationCriteria applicationCriteria) {
        applicationCriteria.id();
        applicationCriteria.company();
        applicationCriteria.roleTitle();
        applicationCriteria.jobUrl();
        applicationCriteria.atsPlatform();
        applicationCriteria.status();
        applicationCriteria.source();
        applicationCriteria.appliedAt();
        applicationCriteria.createdAt();
        applicationCriteria.updatedAt();
        applicationCriteria.userId();
        applicationCriteria.resumeId();
        applicationCriteria.distinct();
    }

    private static Condition<ApplicationCriteria> criteriaFiltersAre(Function<Object, Boolean> condition) {
        return new Condition<>(
            criteria ->
                condition.apply(criteria.getId()) &&
                condition.apply(criteria.getCompany()) &&
                condition.apply(criteria.getRoleTitle()) &&
                condition.apply(criteria.getJobUrl()) &&
                condition.apply(criteria.getAtsPlatform()) &&
                condition.apply(criteria.getStatus()) &&
                condition.apply(criteria.getSource()) &&
                condition.apply(criteria.getAppliedAt()) &&
                condition.apply(criteria.getCreatedAt()) &&
                condition.apply(criteria.getUpdatedAt()) &&
                condition.apply(criteria.getUserId()) &&
                condition.apply(criteria.getResumeId()) &&
                condition.apply(criteria.getDistinct()),
            "every filter matches"
        );
    }

    private static Condition<ApplicationCriteria> copyFiltersAre(ApplicationCriteria copy, BiFunction<Object, Object, Boolean> condition) {
        return new Condition<>(
            criteria ->
                condition.apply(criteria.getId(), copy.getId()) &&
                condition.apply(criteria.getCompany(), copy.getCompany()) &&
                condition.apply(criteria.getRoleTitle(), copy.getRoleTitle()) &&
                condition.apply(criteria.getJobUrl(), copy.getJobUrl()) &&
                condition.apply(criteria.getAtsPlatform(), copy.getAtsPlatform()) &&
                condition.apply(criteria.getStatus(), copy.getStatus()) &&
                condition.apply(criteria.getSource(), copy.getSource()) &&
                condition.apply(criteria.getAppliedAt(), copy.getAppliedAt()) &&
                condition.apply(criteria.getCreatedAt(), copy.getCreatedAt()) &&
                condition.apply(criteria.getUpdatedAt(), copy.getUpdatedAt()) &&
                condition.apply(criteria.getUserId(), copy.getUserId()) &&
                condition.apply(criteria.getResumeId(), copy.getResumeId()) &&
                condition.apply(criteria.getDistinct(), copy.getDistinct()),
            "every filter matches"
        );
    }
}
