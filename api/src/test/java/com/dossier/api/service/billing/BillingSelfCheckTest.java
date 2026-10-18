package com.dossier.api.service.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import org.junit.jupiter.api.Test;

/** K9.6: yearly billing on with the tax mode undecided warns (S-09); a recorded decision, or yearly off, is quiet. */
class BillingSelfCheckTest {

    private final SettingsService settings = mock(SettingsService.class);
    private final BillingSelfCheck check = new BillingSelfCheck(settings);

    private void state(boolean annual, String tax) {
        when(settings.getBool(BillingSettingKeys.ANNUAL_ENABLED)).thenReturn(annual);
        when(settings.getString(BillingSettingKeys.TAX_MODE)).thenReturn(tax);
    }

    @Test
    void warnsWhileAnnualIsOnAndTheTaxModeIsUndecided() {
        state(true, "UNDECIDED");
        assertThat(check.findings()).singleElement().satisfies(f -> {
            assertThat(f.code()).isEqualTo(BillingSelfCheck.ANNUAL_TAX_UNDECIDED);
            assertThat(f.severity()).isEqualTo("WARN");
        });
    }

    @Test
    void isQuietOnceTheDecisionIsRecordedOrWhenAnnualIsOff() {
        state(true, "STRIPE_TAX");
        assertThat(check.findings()).isEmpty();
        state(true, "NOT_COLLECTING");
        assertThat(check.findings()).isEmpty();
        state(false, "UNDECIDED");
        assertThat(check.findings()).isEmpty();
    }

    @Test
    void neverThrowsWhenTheSettingsCannotBeRead() {
        when(settings.getBool(BillingSettingKeys.ANNUAL_ENABLED)).thenThrow(new IllegalStateException("db down"));
        assertThat(check.findings()).isEmpty();
    }
}
