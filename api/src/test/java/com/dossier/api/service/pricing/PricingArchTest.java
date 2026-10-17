package com.dossier.api.service.pricing;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.dossier.api.DossierApiApp;
import com.tngtech.archunit.core.importer.ImportOption.DoNotIncludeTests;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/** K3.1 AC: the pricing and margin code is pure computation, with no repositories, entities, web classes, Spring or Stripe. */
@AnalyzeClasses(packagesOf = DossierApiApp.class, importOptions = DoNotIncludeTests.class)
class PricingArchTest {

    @ArchTest
    static final ArchRule pricingAndMarginArePure = noClasses()
        .that()
        .resideInAnyPackage("com.dossier.api.service.pricing..", "com.dossier.api.service.billing.margin..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(
            "com.dossier.api.repository..",
            "com.dossier.api.domain..",
            "com.dossier.api.web..",
            "com.dossier.api.security..",
            "org.springframework..",
            "jakarta.persistence..",
            "com.stripe.."
        );

    @ArchTest
    static final ArchRule pricingNeverDependsOnMargin = noClasses()
        .that()
        .resideInAPackage("com.dossier.api.service.pricing..")
        .should()
        .dependOnClassesThat()
        .resideInAPackage("com.dossier.api.service.billing..");
}
