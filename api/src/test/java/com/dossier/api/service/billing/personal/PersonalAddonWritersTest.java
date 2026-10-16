package com.dossier.api.service.billing.personal;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.dossier.api.DossierApiApp;
import com.dossier.api.repository.sub.PersonalSubscriptionChangeRepository;
import com.dossier.api.repository.sub.SubscriptionAddonRepository;
import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.importer.ImportOption.DoNotIncludeTests;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/**
 * The personal mirror has exactly two writers (docs/subscriptions/07-stripe-mapping.md sections 2.2 and 5): the webhook ({@link PersonalAddonMirror}, called by
 * {@code UserBillingHandler}) and the confirmed-change service ({@link SubscriptionChangeService}, which writes the rows the customer has just bought, before the
 * webhook confirms them). No resource, job or other service may write {@code subscription_addon}; the change records are written by the change service and the
 * applier that finishes them.
 */
@AnalyzeClasses(packagesOf = DossierApiApp.class, importOptions = DoNotIncludeTests.class)
class PersonalAddonWritersTest {

    private static DescribedPredicate<JavaMethodCall> writesTo(Class<?> repository) {
        return new DescribedPredicate<>("write through " + repository.getSimpleName()) {
            @Override
            public boolean test(JavaMethodCall call) {
                String name = call.getTarget().getName();
                return call.getTargetOwner().isAssignableTo(repository) && (name.startsWith("save") || name.startsWith("delete"));
            }
        };
    }

    @ArchTest
    static final ArchRule onlyTheWebhookMirrorAndTheChangeServiceWriteAddonRows = noClasses()
        .that()
        .doNotHaveFullyQualifiedName(PersonalAddonMirror.class.getName())
        .and()
        .doNotHaveFullyQualifiedName(SubscriptionChangeService.class.getName())
        .should()
        .callMethodWhere(writesTo(SubscriptionAddonRepository.class));

    @ArchTest
    static final ArchRule onlyTheChangeServiceAndTheApplierWriteChangeRecords = noClasses()
        .that()
        .doNotHaveFullyQualifiedName(SubscriptionChangeService.class.getName())
        .and()
        .doNotHaveFullyQualifiedName(SubscriptionChangeApplier.class.getName())
        .should()
        .callMethodWhere(writesTo(PersonalSubscriptionChangeRepository.class));
}
