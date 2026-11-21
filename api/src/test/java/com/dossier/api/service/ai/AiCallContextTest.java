package com.dossier.api.service.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class AiCallContextTest {

    @Test
    void organizationContextCarriesActorBeneficiaryAndUsageReference() {
        AiCallContext context = AiCallContext.organization("actor", "beneficiary", 7L, "ai.job_matching", 11L);

        assertThat(context.actorLogin()).isEqualTo("actor");
        assertThat(context.beneficiaryLogin()).isEqualTo("beneficiary");
        assertThat(context.orgId()).isEqualTo(7L);
        assertThat(context.featureKey()).isEqualTo("ai.job_matching");
        assertThat(context.usageEventId()).isEqualTo(11L);
        assertThat(context.organizationCall()).isTrue();
    }

    @Test
    void personalContextCannotCarryOrganizationAttribution() {
        assertThatThrownBy(() -> new AiCallContext("actor", "beneficiary", null, "ai.job_matching", 11L))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
