package com.dossier.api.domain;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;

/**
 * U6.12 (docs/change-audit/README.md section 2): the rule "every record more than one person can change says who changed it last"
 * as a test. The JPA entities that MUST carry {@code updated_by_*} are listed; any other entity with an {@code updated_at} column and
 * no {@code updated_by*} column fails the build with its name, unless it is in {@link #EXEMPT} with a reason. A new table that more
 * than one person can change therefore cannot be added silently: it either carries the columns or is consciously listed here.
 */
class ChangeAuditCoverageTest {

    /** Records the audit covers: they must carry created_by_* / updated_by_* (the resume's names: created_by_login / updated_by_login). */
    static final Set<String> REQUIRED = Set.of(
        "Application", "ApplicationNote", "Interview", "Resume",
        // Enterprise application records (X9.13): created_by_member_id / updated_by_member_id
        "TalentApplication", "TalentInterview", "TalentApplicationNote", "MktSubmission", "CwsSubmission",
        // Offers (X9.8): the org records them, the consultant answers; created_by_member_id / updated_by_member_id / updated_by_kind
        "CwsOffer"
    );

    /**
     * Entities with an updated_at that deliberately carry no updated_by: settings and per-person preference rows (one writer: their owner,
     * or the platform admin through the admin audit trail), caches, derived projections and system-written counters. Adding to this list is a
     * decision: a record more than one person can change belongs in {@link #REQUIRED} instead.
     */
    static final Set<String> EXEMPT = Set.of(
        // Per-person preferences, caches and drafts: one writer, the owner.
        "Bio", "FieldCache", "InboxConnection", "InboxFolderState", "JobMatch", "JobMatchSetting", "NotificationPreference", "OnboardingDraft",
        "ProfileItem", "ProfileSuggestion", "ResumeDoc", "Subscription",
        // Organization structure and billing: written through the org audit trail (org_audit_event keeps actor, role, risk).
        "DataShare", "Organization", "OrgMember", "OrgAssignment", "OrgHostname", "OrgRoleDefinition", "ConsultantLicense", "OrgBillingAccount",
        "OrgContract", "OrgSubscriptionItem", "UsageCounter",
        // Consultant workspace working data: the consultant's own rows.
        "CwsAvailabilityBlock", "CwsInterviewDetail", "CwsInterviewFeedback", "CwsJobSource", "CwsNotificationPref", "CwsOpportunityResponse",
        "CwsPlacementChecklist", "CwsPlacementDetail", "CwsPlacementMeeting", "CwsPlacementMilestone", "CwsProfileDetail", "CwsSetting", "CwsTask",
        "CwsTaskDetail", "CwsWorkPreference",
        // Marketer workspace working data and views.
        "MktBenchmark", "MktFollowup", "MktGoal", "MktInterviewMeta", "MktJobMeta", "MktJobStream", "MktOpportunity", "MktSavedView", "MktStreamRule",
        "MktSubmissionView", "MktTask",
        // HR / finance / reports (record-only; their own audit rows).
        "FinanceForecastInput", "FinancePlacementPeriod", "FinancePlacementTerms", "HrDocumentRequirement", "HrEmployee", "ReportDefinition",
        // Talent directory.
        "ClientAccount", "ClientRequirement", "ConsultantProfile", "MarketerAssignment", "MarketerCapacity", "OrgResume", "TalentPlacement"
    );

    @Test
    void theRequiredEntitiesCarryCreatedByAndUpdatedBy() {
        Set<Class<?>> all = entities();
        for (String name : REQUIRED) {
            Class<?> c = all.stream().filter(e -> e.getSimpleName().equals(name)).findFirst().orElse(null);
            assertThat(c).as("required entity " + name + " exists").isNotNull();
            Set<String> cols = columns(c);
            assertThat(cols.stream().anyMatch(ChangeAuditCoverageTest::isUpdatedBy)).as(name + " has an updated_by column").isTrue();
            assertThat(cols.stream().anyMatch(col -> col.startsWith("created_by") || col.equals("author_member_id"))).as(name + " has a created_by column").isTrue();
        }
    }

    @Test
    void everyEntityWithAnUpdatedAtIsAuditedOrConsciouslyExempt() {
        assertThat(violations(entities(), EXEMPT)).as("entities with updated_at and no updated_by*; add the columns (docs/change-audit/README.md) or list them as EXEMPT with a reason").isEmpty();
    }

    @Test
    void theExemptListHasNoStaleNamesAndNothingInBothLists() {
        Set<String> names = new TreeSet<>();
        for (Class<?> c : entities()) names.add(c.getSimpleName());
        for (String exempt : EXEMPT) assertThat(names).as("EXEMPT names a real entity: " + exempt).contains(exempt);
        for (String required : REQUIRED) assertThat(EXEMPT).as(required + " is audited, so it cannot also be exempt").doesNotContain(required);
    }

    /** The test would catch a new entity: an updated_at with no updated_by fails with the class name. */
    @Test
    void aFixtureEntityWithUpdatedAtAndNoUpdatedByFails() {
        assertThat(violations(List.of(NewUnauditedRecord.class, NewAuditedRecord.class), Set.of())).containsExactly("NewUnauditedRecord");
        assertThat(violations(List.of(NewUnauditedRecord.class), Set.of("NewUnauditedRecord"))).isEmpty();
    }

    // ---- the scan --------------------------------------------------------------------------------------------

    static List<String> violations(Collection<Class<?>> entities, Set<String> exempt) {
        List<String> out = new ArrayList<>();
        for (Class<?> c : entities) {
            Set<String> cols = columns(c);
            boolean hasUpdatedAt = cols.contains("updated_at") || cols.contains("last_modified_date");
            boolean hasUpdatedBy = cols.stream().anyMatch(ChangeAuditCoverageTest::isUpdatedBy);
            if (hasUpdatedAt && !hasUpdatedBy && !exempt.contains(c.getSimpleName())) out.add(c.getSimpleName());
        }
        return out;
    }

    private static boolean isUpdatedBy(String column) {
        return column.startsWith("updated_by") || column.equals("last_modified_by");
    }

    /** Every JPA entity under the domain package. */
    private static Set<Class<?>> entities() {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Entity.class));
        Set<Class<?>> out = new LinkedHashSet<>();
        for (BeanDefinition bd : scanner.findCandidateComponents("com.dossier.api.domain")) {
            try {
                out.add(Class.forName(bd.getBeanClassName()));
            } catch (ClassNotFoundException e) {
                throw new IllegalStateException(e);
            }
        }
        return out;
    }

    /** Column names of an entity and its mapped superclasses: the {@code @Column(name)} or the snake-cased field name. */
    static Set<String> columns(Class<?> type) {
        Set<String> out = new LinkedHashSet<>();
        for (Class<?> c = type; c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field f : c.getDeclaredFields()) {
                if (Modifier.isStatic(f.getModifiers())) continue;
                Column col = f.getAnnotation(Column.class);
                out.add(col != null && !col.name().isEmpty() ? col.name().toLowerCase(Locale.ROOT) : snake(f.getName()));
            }
        }
        return out;
    }

    private static String snake(String camel) {
        return camel.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase(Locale.ROOT);
    }

    // ---- fixtures ------------------------------------------------------------------------------------------

    @SuppressWarnings("unused")
    private static class NewUnauditedRecord {

        @Column(name = "updated_at")
        private java.time.Instant updatedAt;
    }

    @SuppressWarnings("unused")
    private static class NewAuditedRecord {

        @Column(name = "updated_at")
        private java.time.Instant updatedAt;

        @Column(name = "updated_by_login")
        private String updatedByLogin;
    }
}
