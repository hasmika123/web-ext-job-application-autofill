package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeAiProposal;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.ResumeDocVersion;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.domain.enumeration.Provenance;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.ResumeAiProposalRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeDocVersionRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.StorageKeys;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * Account deletion and export reach the Resume Builder tables (R0.1): profile items, documents,
 * version history and AI proposals are erased with the account - none of them can block the user
 * delete (all four carry a user FK) - and the export includes the profile items and documents.
 * Both erase paths (self-serve and admin-by-login) are covered.
 */
@IntegrationTest
@Transactional
class AccountDeletionServiceIT {

    @Autowired
    private AccountDeletionService accountDeletionService;

    @Autowired
    private AccountExportService accountExportService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private ProfileItemRepository profileItemRepository;

    @Autowired
    private ResumeDocRepository resumeDocRepository;

    @Autowired
    private ResumeDocVersionRepository resumeDocVersionRepository;

    @Autowired
    private ResumeAiProposalRepository resumeAiProposalRepository;

    @Autowired
    private FileStorage storage;

    /** Stubbed: this test is about OUR cleanup, not Stripe's API (a keyless server skips it anyway). */
    @MockitoBean
    private StripeGateway stripeGateway;

    private User user;
    private Long resumeId;
    private Long itemId;
    private Long versionId;
    private Long proposalId;
    private List<String> userFiles;
    private String strangerFile;

    @BeforeEach
    void seedBuilderRows() {
        user = userRepository.findOneByLogin("user").orElseThrow();

        Resume resume = new Resume().label("Built").r2ObjectKey("").status(ResumeStatus.NEEDS_REVIEW).createdAt(Instant.now());
        resume.setUser(user);
        resumeId = resumeRepository.saveAndFlush(resume).getId();

        ProfileItem item = new ProfileItem();
        item.setUser(user);
        item.setSection(ProfileSection.EXPERIENCE);
        item.setDataJson("{\"title\":\"Engineer\"}");
        item.setProvenance(Provenance.USER);
        itemId = profileItemRepository.saveAndFlush(item).getId();
        // A soft-deleted item is still the user's data: erased on deletion, left out of the export.
        ProfileItem softDeleted = new ProfileItem();
        softDeleted.setUser(user);
        softDeleted.setSection(ProfileSection.SKILL);
        softDeleted.setPosition(1);
        softDeleted.setDataJson("{\"group\":\"Old\"}");
        softDeleted.setProvenance(Provenance.PARSED);
        softDeleted.setDeletedAt(Instant.now());
        profileItemRepository.saveAndFlush(softDeleted);

        ResumeDoc doc = new ResumeDoc();
        doc.setResume(resume);
        doc.setUser(user);
        doc.setDocJson("{\"schema\":1}");
        doc.setThemeJson("{}");
        doc.setContentHash("f".repeat(64));
        resumeDocRepository.saveAndFlush(doc);

        ResumeDocVersion version = new ResumeDocVersion();
        version.setUser(user);
        version.setResumeId(resumeId);
        version.setVersionNo(1);
        version.setReason("MANUAL");
        version.setDocJson("{\"schema\":1}");
        version.setTemplateId("modern");
        version.setThemeJson("{}");
        version.setContentHash("f".repeat(64));
        versionId = resumeDocVersionRepository.saveAndFlush(version).getId();

        ResumeAiProposal proposal = new ResumeAiProposal();
        proposal.setUser(user);
        proposal.setResumeId(resumeId);
        proposal.setContentHash("f".repeat(64));
        proposal.setTask("summary");
        proposal.setCacheKey("k");
        proposal.setResultJson("{}");
        proposalId = resumeAiProposalRepository.saveAndFlush(proposal).getId();

        // One stored file under every prefix the API writes - including a replaced thumbnail no row points at -
        // plus a stranger's file that must survive.
        Long uid = user.getId();
        userFiles = new java.util.ArrayList<>();
        for (String prefix : StorageKeys.userPrefixes(uid)) {
            userFiles.add(prefix + resumeId + "-it-" + java.util.UUID.randomUUID() + ".bin");
        }
        userFiles.add("resume-thumbs/" + uid + "/" + resumeId + "-" + "e".repeat(64) + ".png");
        for (String key : userFiles) storage.store(key, new byte[] { 1, 2, 3 }, "application/octet-stream");
        strangerFile = "resumes/" + (uid + 100_000) + "/1-it-stranger.bin";
        storage.store(strangerFile, new byte[] { 9 }, "application/octet-stream");
    }

    @AfterEach
    void removeTestFiles() {
        storage.delete(strangerFile);
        userFiles.forEach(storage::delete);
    }

    /** Privacy: after an account is erased, listing every prefix the API writes for that user finds nothing. */
    private void assertStoredFilesGone() {
        for (String prefix : StorageKeys.userPrefixes(user.getId())) {
            assertThat(storage.list(prefix, null).keys()).as("files left under " + prefix).isEmpty();
        }
        assertThat(storage.exists(strangerFile)).as("another user's file is untouched").isTrue();
    }

    @Test
    @WithMockUser(username = "user")
    void selfServeDeletionErasesEveryBuilderRowAndEveryStoredFile() {
        accountDeletionService.deleteCurrentUserAccount();

        assertBuilderRowsGone();
        assertStoredFilesGone();
        assertThat(userRepository.findOneByLogin("user")).isEmpty();
    }

    @Test
    @WithMockUser(username = "admin")
    void adminDeletionErasesEveryBuilderRowAndEveryStoredFile() {
        accountDeletionService.deleteUserAccountByLogin("user");

        assertBuilderRowsGone();
        assertStoredFilesGone();
        assertThat(userRepository.findOneByLogin("user")).isEmpty();
    }

    @Test
    @WithMockUser(username = "user")
    @SuppressWarnings("unchecked")
    void exportIncludesLiveProfileItemsAndDocs() {
        Map<String, Object> export = accountExportService.exportCurrentUser();

        List<Map<String, Object>> items = (List<Map<String, Object>>) export.get("profileItems");
        assertThat(items).hasSize(1);
        assertThat(items.get(0)).containsEntry("id", itemId).containsEntry("section", "EXPERIENCE").containsEntry("provenance", "USER");
        assertThat(items.get(0).get("data").toString()).contains("Engineer");

        List<Map<String, Object>> docs = (List<Map<String, Object>>) export.get("resumeDocs");
        assertThat(docs).hasSize(1);
        assertThat(docs.get(0)).containsEntry("resumeId", resumeId).containsEntry("templateId", "modern");
        assertThat(docs.get(0).get("doc").toString()).contains("schema");
    }

    private void assertBuilderRowsGone() {
        assertThat(profileItemRepository.findByIdAndUserId(itemId, user.getId())).isEmpty();
        assertThat(profileItemRepository.findAll().stream().filter(p -> p.getUser().getId().equals(user.getId()))).isEmpty();
        assertThat(resumeDocRepository.findByResumeIdAndUserId(resumeId, user.getId())).isEmpty();
        assertThat(resumeDocVersionRepository.findById(versionId)).isEmpty();
        assertThat(resumeAiProposalRepository.findById(proposalId)).isEmpty();
        assertThat(resumeRepository.findById(resumeId)).isEmpty();
    }
}
