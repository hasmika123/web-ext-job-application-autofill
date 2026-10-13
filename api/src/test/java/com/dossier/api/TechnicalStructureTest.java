package com.dossier.api;

import static com.tngtech.archunit.base.DescribedPredicate.alwaysTrue;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.belongToAnyOf;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;

import com.tngtech.archunit.core.importer.ImportOption.DoNotIncludeTests;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

@AnalyzeClasses(packagesOf = DossierApiApp.class, importOptions = DoNotIncludeTests.class)
class TechnicalStructureTest {

    // prettier-ignore
    @ArchTest
    static final ArchRule respectsTechnicalArchitectureLayers = layeredArchitecture()
        .consideringAllDependencies()
        .layer("Config").definedBy("..config..")
        .layer("Web").definedBy("..web..")
        .optionalLayer("Service").definedBy("..service..")
        .layer("Security").definedBy("..security..")
        .optionalLayer("Persistence").definedBy("..repository..")
        .layer("Domain").definedBy("..domain..")

        .whereLayer("Config").mayNotBeAccessedByAnyLayer()
        .whereLayer("Web").mayOnlyBeAccessedByLayers("Config")
        .whereLayer("Service").mayOnlyBeAccessedByLayers("Web", "Config")
        .whereLayer("Security").mayOnlyBeAccessedByLayers("Config", "Service", "Web")
        .whereLayer("Persistence").mayOnlyBeAccessedByLayers("Service", "Security", "Web", "Config")
        .whereLayer("Domain").mayOnlyBeAccessedByLayers("Persistence", "Service", "Security", "Web", "Config")

        .ignoreDependency(belongToAnyOf(DossierApiApp.class), alwaysTrue())
        .ignoreDependency(alwaysTrue(), belongToAnyOf(
            com.dossier.api.config.Constants.class,
            com.dossier.api.config.ApplicationProperties.class
        ));

    // The FileStorage seam: only the S3 driver may touch the AWS SDK; everything else (resources,
    // services, R0.6 PDF export) goes through FileStorage and never learns which driver is active.
    @ArchTest
    static final ArchRule awsSdkIsOnlyUsedByTheS3StorageDriver = noClasses()
        .that()
        .resideOutsideOfPackage("..service.storage.s3..")
        .should()
        .dependOnClassesThat()
        .resideInAPackage("software.amazon.awssdk..");

    // X1.10: background work gets its tenant as an explicit orgId through TenantScoped, never by reading the request-thread
    // holder (a scheduler thread has no request; whatever the holder says there is a leak).
    @ArchTest
    static final ArchRule schedulersAndJobsNeverReadTheTenantContextHolder = noClasses()
        .that()
        .haveSimpleNameEndingWith("Scheduler")
        .or()
        .haveSimpleNameEndingWith("Job")
        .should()
        .dependOnClassesThat()
        .belongToAnyOf(com.dossier.api.service.ent.TenantContextHolder.class);
}
