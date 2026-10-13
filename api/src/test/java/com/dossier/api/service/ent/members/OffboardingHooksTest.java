package com.dossier.api.service.ent.members;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.dto.ent.MemberActionDTO;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

/**
 * The offboarding hook chain (15-employees-and-teams.md section 5, 09-consistency-decisions.md row 4): one fixed order, the preview and the apply
 * run the same chain, a missing step is simply absent, and a step that throws stops everything after it (the transaction then rolls the whole
 * offboarding back).
 */
class OffboardingHooksTest {

    /** A step that records what it was asked to do. */
    private static final class Fake implements OffboardingHook {

        final int order;
        final String key;
        final List<String> log;
        final boolean fails;

        Fake(int order, String key, List<String> log, boolean fails) {
            this.order = order;
            this.key = key;
            this.log = log;
            this.fails = fails;
        }

        @Override
        public int getOrder() {
            return order;
        }

        @Override
        public String key() {
            return key;
        }

        @Override
        public List<MemberActionDTO.HookLine> preview(Long orgId, Long memberId) {
            log.add("preview:" + key);
            return List.of(new MemberActionDTO.HookLine(key, key.toUpperCase(), "will " + key, Map.of()));
        }

        @Override
        public void apply(Context context) {
            log.add("apply:" + key);
            if (fails) throw new IllegalStateException(key + " failed");
        }
    }

    private static OffboardingHook.Context ctx() {
        return new OffboardingHook.Context(1L, 2L, "someone", "a reason that is long enough", "owner", List.of());
    }

    @Test
    void theSevenStepsOfTheDocumentHaveFixedAscendingOrders() {
        assertThat(
            List.of(
                OffboardingHook.ORDER_SESSIONS, OffboardingHook.ORDER_ASSIGNMENTS, OffboardingHook.ORDER_CONSENT, OffboardingHook.ORDER_RESUME_LINKS,
                OffboardingHook.ORDER_LICENSES, OffboardingHook.ORDER_PIPELINE, OffboardingHook.ORDER_EMPLOYMENT
            )
        )
            .as("Sessions, Assignments, Consent, OrgResumeLinks, Licenses, Pipeline, EmploymentRecord (doc 15 section 5)")
            .containsExactly(100, 200, 300, 400, 500, 600, 700);
    }

    @Test
    void theBeansTheProductShipsRunInTheDocumentedOrder() {
        DefaultListableBeanFactory factory = new DefaultListableBeanFactory();
        // registered out of order on purpose: the order comes from the hook, not from registration
        factory.registerSingleton("consent", new DefaultOffboardingHooks.Consent(null));
        factory.registerSingleton("assignments", new DefaultOffboardingHooks.Assignments());
        factory.registerSingleton("sessions", new DefaultOffboardingHooks.Sessions());
        OffboardingHooks chain = new OffboardingHooks(factory.getBeanProvider(OffboardingHook.class));
        assertThat(chain.keys()).containsExactly("sessions", "assignments", "consent");
    }

    @Test
    void aStepAnotherStoryRegistersSlotsIntoItsPlace() {
        List<String> log = new ArrayList<>();
        DefaultListableBeanFactory factory = new DefaultListableBeanFactory();
        factory.registerSingleton("licenses", new Fake(OffboardingHook.ORDER_LICENSES, "licenses", log, false));
        factory.registerSingleton("sessions", new Fake(OffboardingHook.ORDER_SESSIONS, "sessions", log, false));
        factory.registerSingleton("consent", new Fake(OffboardingHook.ORDER_CONSENT, "consent", log, false));
        factory.registerSingleton("employment", new Fake(OffboardingHook.ORDER_EMPLOYMENT, "employment", log, false));
        assertThat(new OffboardingHooks(factory.getBeanProvider(OffboardingHook.class)).keys()).containsExactly("sessions", "consent", "licenses", "employment");
    }

    @Test
    void thePreviewAndTheApplyReadTheSameLines() {
        List<String> log = new ArrayList<>();
        OffboardingHooks chain = new OffboardingHooks(List.of(new Fake(100, "sessions", log, false), new Fake(300, "consent", log, false)));
        List<MemberActionDTO.HookLine> preview = chain.preview(1L, 2L);
        log.clear();
        List<MemberActionDTO.HookLine> applied = chain.apply(ctx());
        assertThat(applied).isEqualTo(preview);
        assertThat(log).containsExactly("preview:sessions", "preview:consent", "apply:sessions", "apply:consent");
    }

    @Test
    void aStepThatThrowsStopsTheStepsAfterIt() {
        List<String> log = new ArrayList<>();
        OffboardingHooks chain = new OffboardingHooks(List.of(new Fake(100, "sessions", log, false), new Fake(200, "assignments", log, true), new Fake(300, "consent", log, false)));
        assertThatThrownBy(() -> chain.apply(ctx())).isInstanceOf(IllegalStateException.class).hasMessage("assignments failed");
        assertThat(log).contains("apply:sessions", "apply:assignments").doesNotContain("apply:consent");
    }

    @Test
    void anEmptyChainIsFine() {
        OffboardingHooks chain = new OffboardingHooks(List.of());
        assertThat(chain.preview(1L, 2L)).isEmpty();
        assertThat(chain.apply(ctx())).isEmpty();
    }

    @Test
    void theSessionsStepSaysSoAndTheOthersAreNamedForTheirStoryToReplace() {
        assertThat(new DefaultOffboardingHooks.Sessions().preview(1L, 2L)).hasSize(1);
        assertThat(new DefaultOffboardingHooks.Sessions().getOrder()).isEqualTo(OffboardingHook.ORDER_SESSIONS);
        assertThat(new DefaultOffboardingHooks.Assignments().getOrder()).isEqualTo(OffboardingHook.ORDER_ASSIGNMENTS);
        assertThat(new DefaultOffboardingHooks.Consent(null).getOrder()).isEqualTo(OffboardingHook.ORDER_CONSENT);
    }
}
