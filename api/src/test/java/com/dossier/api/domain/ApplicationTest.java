package com.dossier.api.domain;

import static com.dossier.api.domain.ApplicationTestSamples.*;
import static com.dossier.api.domain.ResumeTestSamples.*;
import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.web.rest.TestUtil;
import org.junit.jupiter.api.Test;

class ApplicationTest {

    @Test
    void equalsVerifier() throws Exception {
        TestUtil.equalsVerifier(Application.class);
        Application application1 = getApplicationSample1();
        Application application2 = new Application();
        assertThat(application1).isNotEqualTo(application2);

        application2.setId(application1.getId());
        assertThat(application1).isEqualTo(application2);

        application2 = getApplicationSample2();
        assertThat(application1).isNotEqualTo(application2);
    }

    @Test
    void resumeTest() {
        Application application = getApplicationRandomSampleGenerator();
        Resume resumeBack = getResumeRandomSampleGenerator();

        application.setResume(resumeBack);
        assertThat(application.getResume()).isEqualTo(resumeBack);

        application.resume(null);
        assertThat(application.getResume()).isNull();
    }
}
