package com.dossier.api.web.rest.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.config.Constants;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.User;
import com.dossier.api.domain.privacy.TermsAcceptance;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.privacy.TermsAcceptanceRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import com.dossier.api.web.rest.vm.ManagedUserVM;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Terms acceptance at sign-up (T0.2): creating the account (the sign-up screen says "By creating an account, you agree to our Terms of Service and Privacy Policy") records
 * both documents at the versions in force, source SIGNUP; and when a NEW version is published the account is "not up to date" until it accepts that version (the banner's Accept).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class SignupTermsAcceptanceIT {

    private static final String LOGIN = "terms-signup-it";

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private TermsAcceptanceRepository acceptances;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings settings;

    @AfterEach
    void cleanUp() {
        settings.invalidate();
    }

    private Long register() throws Exception {
        ManagedUserVM vm = new ManagedUserVM();
        vm.setLogin(LOGIN);
        vm.setPassword("password");
        vm.setFirstName("Tess");
        vm.setLastName("Signup");
        vm.setEmail(LOGIN + "@example.com");
        vm.setLangKey(Constants.DEFAULT_LANGUAGE);
        vm.setAuthorities(Collections.singleton(AuthoritiesConstants.USER));
        mvc.perform(post("/api/register").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(vm))).andExpect(status().isCreated());
        return users.findOneByLogin(LOGIN).map(User::getId).orElseThrow();
    }

    @Test
    void creatingTheAccountRecordsBothDocumentsAtTheVersionsInForce() throws Exception {
        Long id = register();

        List<TermsAcceptance> rows = acceptances.findByUserIdOrderByAcceptedAtDescIdDesc(id);
        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(TermsAcceptance::getDocument).containsExactlyInAnyOrder("TERMS", "PRIVACY");
        assertThat(rows).extracting(TermsAcceptance::getVersion).containsOnly("2026-10");
        assertThat(rows).extracting(TermsAcceptance::getSource).containsOnly("SIGNUP");
        assertThat(rows).allSatisfy(r -> assertThat(r.getAcceptedAt()).isBeforeOrEqualTo(Instant.now()));

        mvc.perform(get("/api/account/terms-acceptance").with(user(LOGIN))).andExpect(status().isOk()).andExpect(jsonPath("$.upToDate").value(true));
    }

    @Test
    void aFailedRegistrationRecordsNothing() throws Exception {
        long before = acceptances.count();
        ManagedUserVM vm = new ManagedUserVM();
        vm.setLogin(LOGIN);
        vm.setPassword("123"); // too short
        vm.setEmail(LOGIN + "@example.com");
        vm.setLangKey(Constants.DEFAULT_LANGUAGE);
        mvc.perform(post("/api/register").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(vm))).andExpect(status().isBadRequest());
        assertThat(acceptances.count()).isEqualTo(before);
    }

    @Test
    void aNewVersionNeedsAFreshAcceptanceAndAcceptingItRecordsTheNewVersion() throws Exception {
        Long id = register();
        settingRows.saveAndFlush(new AppSetting(AdminSettingKeys.LEGAL_TERMS_VERSION, "2027-01", "terms-it", Instant.now()));
        settings.invalidate();

        // the banner's question: not up to date, and which version is now in force
        mvc
            .perform(get("/api/account/terms-acceptance").with(user(LOGIN)))
            .andExpect(jsonPath("$.upToDate").value(false))
            .andExpect(jsonPath("$.terms.currentVersion").value("2027-01"))
            .andExpect(jsonPath("$.terms.accepted").value(false))
            .andExpect(jsonPath("$.terms.lastAcceptedVersion").value("2026-10"))
            .andExpect(jsonPath("$.privacy.accepted").value(true));

        // the banner's Accept: records the new terms version (the privacy notice did not change)
        mvc
            .perform(post("/api/account/terms-acceptance").with(user(LOGIN)).contentType(MediaType.APPLICATION_JSON).content("{\"document\":\"TERMS\",\"version\":\"2027-01\",\"source\":\"RECONFIRM\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.upToDate").value(true));
        assertThat(acceptances.existsByUserIdAndDocumentAndVersion(id, "TERMS", "2027-01")).isTrue();
        assertThat(acceptances.existsByUserIdAndDocumentAndVersion(id, "TERMS", "2026-10")).as("the first acceptance stays on record").isTrue();
        assertThat(acceptances.findByUserIdOrderByAcceptedAtDescIdDesc(id).get(0).getSource()).isEqualTo("RECONFIRM");
    }
}
