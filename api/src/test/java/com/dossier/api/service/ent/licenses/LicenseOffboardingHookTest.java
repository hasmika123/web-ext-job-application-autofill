package com.dossier.api.service.ent.licenses;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.service.ent.members.OffboardingHook;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** Offboarding step 500 (LICENCES-BUILD.md L5): a leaving consultant's licence ends now; nobody else is touched. */
class LicenseOffboardingHookTest {

    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    OrgLicenseGate gate = mock(OrgLicenseGate.class);
    OrgLicenseService licenses = mock(OrgLicenseService.class);
    LicenseOffboardingHook hook = new LicenseOffboardingHook(consultants, gate, licenses);

    OffboardingHook.Context ctx = new OffboardingHook.Context(7L, 71L, "ent#7#anika", "left", "sarah", List.of());

    @Test
    void itRunsInTheLicenceSlot() {
        assertThat(hook.getOrder()).isEqualTo(OffboardingHook.ORDER_LICENSES);
        assertThat(hook.key()).isEqualTo("licenses");
    }

    @Test
    void aLeavingConsultantsLicenceEndsAndThePreviewSaysSo() {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(72L);
        when(consultants.findByOrgIdAndMemberId(7L, 71L)).thenReturn(Optional.of(c));
        when(gate.liveLicense(7L, 72L)).thenReturn(Optional.of(new ConsultantLicense()));
        assertThat(hook.preview(7L, 71L)).singleElement().satisfies(l -> assertThat(l.text()).contains("licence"));
        hook.apply(ctx);
        verify(licenses).endForSeat(7L, 72L, "MEMBER_LEFT", null);
    }

    @Test
    void aMemberWhoIsNoConsultantOrHoldsNoLicenceIsSkipped() {
        when(consultants.findByOrgIdAndMemberId(7L, 71L)).thenReturn(Optional.empty());
        assertThat(hook.preview(7L, 71L)).isEmpty();
        hook.apply(ctx);
        verify(licenses, never()).endForSeat(org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any());
    }
}
