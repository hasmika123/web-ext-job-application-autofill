package com.dossier.api.service.ent.accounts;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The duplicate check compares words, not punctuation or case; the status and priority words are the ones the Requirements page offers. */
class AccountRequirementServiceTest {

    @Test
    void normReducesATitleToItsWords() {
        assertThat(AccountRequirementService.norm("  Sr. Java   Developer ")).isEqualTo("sr java developer");
        assertThat(AccountRequirementService.norm("SR JAVA DEVELOPER")).isEqualTo(AccountRequirementService.norm("sr, java developer!"));
        assertThat(AccountRequirementService.norm(null)).isEmpty();
        assertThat(AccountRequirementService.norm("Austin, TX")).isEqualTo(AccountRequirementService.norm("austin tx"));
        assertThat(AccountRequirementService.norm("C++ Developer")).isNotEqualTo(AccountRequirementService.norm("C# Developer"));
        assertThat(AccountRequirementService.norm("C++ Developer")).isNotEqualTo(AccountRequirementService.norm("C Developer"));
    }

    @Test
    void theWordsOfTheWorkflowAreFixed() {
        assertThat(AccountRequirementService.PRIORITIES).containsExactly("LOW", "NORMAL", "HIGH", "URGENT");
        assertThat(AccountRequirementService.SOURCES).containsExactly("MANUAL", "PASTED_TEXT", "LINK");
        assertThat(AccountRequirementService.STATUSES).containsExactly("OPEN", "IN_REVIEW", "ON_HOLD", "FILLED", "CLOSED");
    }
}
