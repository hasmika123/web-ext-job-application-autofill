package com.dossier.api;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.dossier.api.service.ApplicationEventService;
import com.dossier.api.service.ApplicationPatchService;
import com.dossier.api.service.ApplicationService;
import com.dossier.api.service.ApplicationSyncService;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * The Marketing Manager workspace approves and escalates PREPARATION; it never submits (E1, ADR-010). Besides the org-wide rules of {@code NoSubmitSurfaceTest}
 * (which stay as they are), nothing in the manager packages (approvals, escalations, the manager services and routes) may depend on a service that writes a
 * person's application, and nothing in them may be named as sending or submitting one.
 */
class MgmtNeverSubmitsTest {

    private static final String[] MANAGER_PACKAGES = {
        "com.dossier.api.service.ent.mkt.approvals..",
        "com.dossier.api.service.ent.mkt.escalations..",
        "com.dossier.api.service.ent.mgmt..",
        "com.dossier.api.web.rest.ent.mgmt..",
    };

    private static JavaClasses classes;

    @BeforeAll
    static void importMain() {
        classes = new ClassFileImporter().withImportOption(new ImportOption.DoNotIncludeTests()).importPackages("com.dossier.api");
    }

    @Test
    void noManagerClassDependsOnAServiceThatWritesAnApplication() {
        noClasses()
            .that()
            .resideInAnyPackage(MANAGER_PACKAGES)
            .should()
            .dependOnClassesThat()
            .belongToAnyOf(ApplicationSyncService.class, ApplicationEventService.class, ApplicationPatchService.class, ApplicationService.class)
            .because("a manager approves and escalates preparation; only the consultant's own application writers change an application")
            .check(classes);
    }

    @Test
    void noManagerClassOrMethodIsNamedAsSubmittingOrSending() {
        noClasses()
            .that()
            .resideInAnyPackage(MANAGER_PACKAGES)
            .should()
            .haveSimpleNameContaining("Submit")
            .orShould()
            .haveSimpleNameContaining("AutoApply")
            .check(classes);
        noClasses()
            .that()
            .resideInAnyPackage(MANAGER_PACKAGES)
            .should()
            .callMethodWhere(
                com.tngtech.archunit.core.domain.JavaCall.Predicates.target(
                    com.tngtech.archunit.base.DescribedPredicate.describe("a method named submit or send", t -> t.getName().equalsIgnoreCase("submit") || t.getName().equalsIgnoreCase("send"))
                )
            )
            .check(classes);
    }
}
