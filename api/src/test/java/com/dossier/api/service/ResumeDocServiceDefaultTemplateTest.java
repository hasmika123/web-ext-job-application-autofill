package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Template QA: with the default template disabled, the builder config used to still say "engineer" while the API created
 * the resume as the first enabled template, so the New Resume sheet promised one template and created another.
 */
class ResumeDocServiceDefaultTemplateTest {

    private static final List<String> ALL = List.of("modern", "classic", "compact", "simple", "engineer");

    @Test
    void anEnabledDefaultIsKept() {
        assertThat(ResumeDocService.effectiveDefaultTemplate(ALL, "engineer")).isEqualTo("engineer");
    }

    @Test
    void aDisabledDefaultFallsBackToTheFirstEnabledTemplate() {
        List<String> withoutEngineer = List.of("classic", "compact", "simple");
        assertThat(ResumeDocService.effectiveDefaultTemplate(withoutEngineer, "engineer")).isEqualTo("classic");
    }

    @Test
    void anEmptyEnabledListLeavesTheConfiguredValueAlone() {
        assertThat(ResumeDocService.effectiveDefaultTemplate(List.of(), "modern")).isEqualTo("modern");
    }
}
