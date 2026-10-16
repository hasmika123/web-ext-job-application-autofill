package com.dossier.api.service.ent.consultants;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.org.OrgException;
import org.junit.jupiter.api.Test;

class ConsultantContactTest {

    @Test
    void phoneAcceptsFormattedNumbersAndBlankClears() {
        assertThat(ConsultantContact.phone("(555) 010-0142")).isEqualTo("(555) 010-0142");
        assertThat(ConsultantContact.phone("+1 555 010 0142")).isEqualTo("+1 555 010 0142");
        assertThat(ConsultantContact.phone("  ")).isNull();
        assertThat(ConsultantContact.phone(null)).isNull();
    }

    @Test
    void phoneRefusesLettersAndWrongLengths() {
        assertThatThrownBy(() -> ConsultantContact.phone("call me")).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> ConsultantContact.phone("12345")).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> ConsultantContact.phone("1".repeat(20))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> ConsultantContact.phone(12345678)).isInstanceOf(OrgException.class);
    }

    @Test
    void timeZoneMustBeAnIanaId() {
        assertThat(ConsultantContact.timeZone("America/Chicago")).isEqualTo("America/Chicago");
        assertThat(ConsultantContact.timeZone("UTC")).isEqualTo("UTC");
        assertThat(ConsultantContact.timeZone("")).isNull();
        assertThatThrownBy(() -> ConsultantContact.timeZone("Mars/Olympus")).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> ConsultantContact.timeZone("+05:30")).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> ConsultantContact.timeZone("Chicago")).isInstanceOf(OrgException.class);
    }

    @Test
    void preferredContactIsAKnownLabel() {
        assertThat(ConsultantContact.preferred("phone")).isEqualTo("PHONE");
        assertThat(ConsultantContact.preferred(null)).isNull();
        assertThatThrownBy(() -> ConsultantContact.preferred("pigeon")).isInstanceOf(OrgException.class);
    }
}
