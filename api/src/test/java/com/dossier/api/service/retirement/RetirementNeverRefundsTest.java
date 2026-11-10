package com.dossier.api.service.retirement;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.dossier.api.DossierApiApp;
import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.importer.ImportOption.DoNotIncludeTests;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/**
 * The lock "no refunds, cancel anytime" as a test of the code (docs/subscriptions/11 section 9, K10.8): nothing in the retirement lifecycle can call a method that refunds, now or
 * after the gateway grows one for another story. A retirement ends a plan at the end of the period that was paid for; it never gives money back and never charges more.
 */
@AnalyzeClasses(packagesOf = DossierApiApp.class, importOptions = DoNotIncludeTests.class)
class RetirementNeverRefundsTest {

    private static final DescribedPredicate<JavaMethodCall> A_REFUND = new DescribedPredicate<>("a method with refund in its name") {
        @Override
        public boolean test(JavaMethodCall call) {
            return call.getTarget().getName().toLowerCase().contains("refund");
        }
    };

    @ArchTest
    static final ArchRule theRetirementPackageNeverCallsARefund = noClasses().that().resideInAPackage("..service.retirement..").should().callMethodWhere(A_REFUND);

    @ArchTest
    static final ArchRule theRetirementResourcesNeverCallARefund = noClasses().that().haveSimpleNameContaining("Retirement").and().resideInAPackage("..web.rest..").should().callMethodWhere(A_REFUND);
}
