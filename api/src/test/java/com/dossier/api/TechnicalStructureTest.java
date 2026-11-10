package com.dossier.api;

import static com.tngtech.archunit.base.DescribedPredicate.alwaysTrue;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.belongToAnyOf;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;
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

    // X2.10 / T12: links for an organization are built from its hostname rows only, never from the request's host.
    @ArchTest
    static final ArchRule tenantUrlsNeverReadTheRequestTenantContext = noClasses()
        .that()
        .belongToAnyOf(com.dossier.api.service.ent.TenantUrls.class)
        .should()
        .dependOnClassesThat()
        .belongToAnyOf(com.dossier.api.service.ent.TenantContext.class, com.dossier.api.service.ent.TenantContextHolder.class);

    // ent-inbox (docs/enterprise-v2/18-consultant-inbox.md): THE PRIVACY WALL, as a build rule. Nothing that serves an organization (the enterprise
    // services, DTOs, resources and the org package) may touch a person's Gmail connection, their stored mail or the key box: the only enterprise class
    // that reads the mail tables is the consultant's own Inbox service, which answers the consultant about themself and nobody else. The organization sees
    // an application's stage through the existing mirror, which is handed a stage and a source label and no mail.
    @ArchTest
    static final ArchRule organizationCodeNeverTouchesAPersonsMailbox = noClasses()
        .that()
        .resideInAnyPackage("..service.ent..", "..service.dto.ent..", "..service.org..", "..web.rest.ent..", "..web.rest.org..", "..domain.ent..", "..repository.ent..")
        .and()
        .doNotHaveFullyQualifiedName("com.dossier.api.service.ent.consultantws.ConsultantInboxService")
        .should()
        .dependOnClassesThat()
        .belongToAnyOf(
            com.dossier.api.domain.InboxMessage.class,
            com.dossier.api.domain.InboxConnection.class,
            com.dossier.api.domain.InboxFolderState.class,
            com.dossier.api.repository.InboxMessageRepository.class,
            com.dossier.api.repository.InboxConnectionRepository.class,
            com.dossier.api.repository.InboxFolderStateRepository.class,
            com.dossier.api.service.inbox.SecretBox.class
        );

    // Decision O4 (docs/enterprise-v2/19): the same email can be a personal account and an enterprise account of each organization, so an email lookup
    // without a scope could match two rows and throw. The only UserRepository methods that read by email are the scoped ones (OrgId / Scope in the name).
    @ArchTest
    static final ArchRule noUnscopedEmailLookup = noClasses()
        .should()
        .callMethodWhere(
            new com.tngtech.archunit.base.DescribedPredicate<com.tngtech.archunit.core.domain.JavaMethodCall>("call a UserRepository email lookup without an account scope") {
                @Override
                public boolean test(com.tngtech.archunit.core.domain.JavaMethodCall call) {
                    String name = call.getTarget().getName();
                    return (
                        call.getTargetOwner().isAssignableTo(com.dossier.api.repository.UserRepository.class) &&
                        name.contains("Email") &&
                        !name.contains("OrgId") &&
                        !name.contains("Scope") &&
                        !name.equals("emailCacheKey")
                    );
                }
            }
        );
    // Act-for (Enterprise V2, doc 30 section 6) swaps the identity ON THE REQUEST THREAD for the duration of a handler. A handler that hands the request to
    // another thread (an async return type) would leave that swap open on a pooled thread, or run its continuation without it. The window is also closed
    // by ActForBuilderInterceptor.afterConcurrentHandlingStarted and cleared by ActForCleanupFilter, but the cheapest wall is to keep the builder routes
    // synchronous: no controller under /api/profile/** (and the builder's other resources) may return or wrap an async type.
    @ArchTest
    static final ArchRule builderControllersNeverReturnAsyncTypes = noMethods()
        .that()
        .areDeclaredInClassesThat(builderControllers())
        .should(notInvolveAsyncReturnTypes());

    private static com.tngtech.archunit.base.DescribedPredicate<com.tngtech.archunit.core.domain.JavaClass> builderControllers() {
        java.util.Set<String> named = java.util.Set.of("ResumeFileResource", "MktResumeBuilderResource", "ConsultantResumesResource");
        return new com.tngtech.archunit.base.DescribedPredicate<>("controllers under /api/profile/** or the Resume Builder's other resources") {
            @Override
            public boolean test(com.tngtech.archunit.core.domain.JavaClass c) {
                if (named.contains(c.getSimpleName())) return true;
                if (!c.isAnnotatedWith(org.springframework.web.bind.annotation.RestController.class)) return false;
                return c
                    .tryGetAnnotationOfType(org.springframework.web.bind.annotation.RequestMapping.class)
                    .map(m -> java.util.Arrays.stream(m.value()).anyMatch(v -> v.startsWith("/api/profile")))
                    .orElse(false);
            }
        };
    }

    /** The async return types Spring MVC understands (by name, so a type that is not on the classpath cannot break the build). */
    static final java.util.List<String> ASYNC_TYPES = java.util.List.of(
        "org.springframework.web.context.request.async.DeferredResult",
        "java.util.concurrent.Callable",
        "java.util.concurrent.CompletableFuture",
        "java.util.concurrent.Future",
        "org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody",
        "org.springframework.web.context.request.async.WebAsyncTask",
        "org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter",
        "reactor.core.publisher.Mono",
        "reactor.core.publisher.Flux"
    );

    private static com.tngtech.archunit.lang.ArchCondition<com.tngtech.archunit.core.domain.JavaMethod> notInvolveAsyncReturnTypes() {
        return new com.tngtech.archunit.lang.ArchCondition<>("not return (or wrap) an async type") {
            @Override
            public void check(com.tngtech.archunit.core.domain.JavaMethod method, com.tngtech.archunit.lang.ConditionEvents events) {
                for (com.tngtech.archunit.core.domain.JavaClass t : method.getReturnType().getAllInvolvedRawTypes()) {
                    for (String banned : ASYNC_TYPES) {
                        if (t.isAssignableTo(banned)) {
                            events.add(
                                com.tngtech.archunit.lang.SimpleConditionEvent.violated(
                                    method,
                                    method.getFullName() + " returns " + t.getName() + ", an async type (act-for must stay on the request thread)"
                                )
                            );
                        }
                    }
                }
            }
        };
    }
}
