package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dossier.api.domain.AiCall;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.service.ai.AiCallContext;
import com.dossier.api.service.ai.AiErrorKind;
import com.dossier.api.service.ai.AiPricing;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class AiOrganizationMeteringTest {

    private final AiUsageRepository usage = mock(AiUsageRepository.class);
    private final AiCallRepository calls = mock(AiCallRepository.class);
    private final AiMeteringService metering = new AiMeteringService(usage, calls, new AiPricing());

    @Test
    void organizationSuccessIsLedgeredWithoutIncrementingPersonalUsage() {
        AiCallContext context = AiCallContext.organization("actor", "beneficiary", 7L, "ai.job_matching", 11L);

        metering.recordWithContext(AiTask.JOBS, new AiResult("{}", "gemini-2.5-flash-lite", 10, 0, 2, "gemini", 50), context);

        ArgumentCaptor<AiCall> captor = ArgumentCaptor.forClass(AiCall.class);
        verify(calls).save(captor.capture());
        AiCall call = captor.getValue();
        assertThat(call.getLogin()).isEqualTo("actor");
        assertThat(call.getBeneficiaryLogin()).isEqualTo("beneficiary");
        assertThat(call.getOrgId()).isEqualTo(7L);
        assertThat(call.getFeatureKey()).isEqualTo("ai.job_matching");
        assertThat(call.getUsageEventId()).isEqualTo(11L);
        assertThat(call.getUsageScope()).isEqualTo("ORG");
        verify(usage, never()).increment(anyString(), anyString());
    }

    @Test
    void organizationFailureKeepsTheSameAttribution() {
        AiCallContext context = AiCallContext.organization("actor", "beneficiary", 7L, "ai.job_matching", 11L);

        metering.recordFailureWithContext(context, AiTask.JOBS, "gemini", "model", AiErrorKind.TIMEOUT, 100);

        ArgumentCaptor<AiCall> captor = ArgumentCaptor.forClass(AiCall.class);
        verify(calls).save(captor.capture());
        AiCall call = captor.getValue();
        assertThat(call.isSuccess()).isFalse();
        assertThat(call.getLogin()).isEqualTo("actor");
        assertThat(call.getBeneficiaryLogin()).isEqualTo("beneficiary");
        assertThat(call.getOrgId()).isEqualTo(7L);
        assertThat(call.getUsageEventId()).isEqualTo(11L);
        assertThat(call.getUsageScope()).isEqualTo("ORG");
    }
}
