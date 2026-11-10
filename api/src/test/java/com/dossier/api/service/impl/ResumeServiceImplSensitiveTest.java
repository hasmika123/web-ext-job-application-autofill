package com.dossier.api.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.dto.ResumeDTO;
import com.dossier.api.service.privacy.SensitiveContentException;
import org.junit.jupiter.api.Test;

/** X11.7: what an uploaded resume stores (label and parsed structure) never holds a never-collected value. */
class ResumeServiceImplSensitiveTest {

    private static ResumeDTO dto(String label, String parsedJson) {
        ResumeDTO d = new ResumeDTO();
        d.setLabel(label);
        d.setParsedJson(parsedJson);
        return d;
    }

    @Test
    void anSsnInTheParsedStructureIsRefusedWith422() {
        assertThatThrownBy(() -> ResumeServiceImpl.refuseSensitive(dto("Resume", "{\"basics\":{\"notes\":\"SSN: 123-45-6789\"}}")))
            .isInstanceOfSatisfying(SensitiveContentException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(422);
                assertThat(e.getPath()).contains("parsedJson");
            });
    }

    @Test
    void aBankNumberInTheParsedStructureIsRefused() {
        assertThatThrownBy(() -> ResumeServiceImpl.refuseSensitive(dto("Resume", "{\"summary\":\"Bank account number: 123456789012\"}")))
            .isInstanceOf(SensitiveContentException.class);
    }

    @Test
    void aSensitiveLabelIsRefusedAndAPlainResumePasses() {
        assertThatThrownBy(() -> ResumeServiceImpl.refuseSensitive(dto("SSN: 123-45-6789", null))).isInstanceOf(SensitiveContentException.class);
        assertThatCode(() -> ResumeServiceImpl.refuseSensitive(dto("Backend resume", "{\"experience\":[{\"title\":\"Engineer\",\"company\":\"Acme\"}]}"))).doesNotThrowAnyException();
        assertThatCode(() -> ResumeServiceImpl.refuseSensitive(dto("Raw file only", null))).doesNotThrowAnyException();
    }

    @Test
    void parsedTextThatIsNotJsonIsScannedAsText() {
        assertThatThrownBy(() -> ResumeServiceImpl.refuseSensitive(dto("Resume", "not json SSN: 123-45-6789"))).isInstanceOf(SensitiveContentException.class);
    }
}
