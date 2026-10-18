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
import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.ResumeAiProposalRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeDocVersionRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.dto.ResumeDTO;
import com.dossier.api.service.mapper.ResumeMapper;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

/**
 * R0.1: the Resume Builder schema boots under Liquibase (the Spring context itself proves the
 * changesets apply) and every new entity inserts and reads back, including the JSON columns, the
 * optimistic-lock version, the ownership finders and the two new {@code resume} columns.
 */
@IntegrationTest
@Transactional
class ResumeBuilderSchemaIT {

    private static final String ITEM_JSON = "{\"title\":\"Software Engineer\",\"org\":\"Acme\",\"bullets\":[\"Led a migration\"]}";
    private static final String DOC_JSON = "{\"schema\":1,\"sections\":[]}";
    private static final String THEME_JSON = "{\"font\":\"Inter\"}";

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
    private ResumeMapper resumeMapper;

    @Autowired
    private EntityManager em;

    private User user;
    private User other;

    @BeforeEach
    void seed() {
        user = userRepository.findOneByLogin("user").orElseThrow();
        other = userRepository.findOneByLogin("admin").orElseThrow();
    }

    private Resume newResume(User owner) {
        Resume r = new Resume().label("Built").r2ObjectKey("").status(ResumeStatus.NEEDS_REVIEW).createdAt(Instant.now());
        r.setUser(owner);
        return resumeRepository.saveAndFlush(r);
    }

    private void clearContext() {
        em.flush();
        em.clear();
    }

    @Test
    void resumeDefaultsToUploadedAndStampsUpdatedAt() {
        // kind is never set: neither the entity default nor the DB default may leave it null.
        Resume saved = newResume(user);
        clearContext();

        Resume read = resumeRepository.findById(saved.getId()).orElseThrow();
        assertThat(read.getKind()).isEqualTo(ResumeKind.UPLOADED);
        assertThat(read.getUpdatedAt()).isNotNull();
    }

    @Test
    void resumeSavedFromADtoWithNoKindStillGetsUploaded() {
        // The mapper copies a null DTO kind over the entity default - the extension never sends one.
        ResumeDTO dto = new ResumeDTO();
        dto.setLabel("From the extension");
        dto.setr2ObjectKey("");
        dto.setStatus(ResumeStatus.NEEDS_REVIEW);
        dto.setCreatedAt(Instant.now());
        Resume entity = resumeMapper.toEntity(dto);
        entity.setUser(user);
        Resume saved = resumeRepository.saveAndFlush(entity);
        clearContext();

        assertThat(resumeRepository.findById(saved.getId()).orElseThrow().getKind()).isEqualTo(ResumeKind.UPLOADED);
    }

    @Test
    void mapperPassesKindAndLeavesTemplateIdNullUntilABuilderServiceFillsIt() {
        Resume r = new Resume().label("Built").r2ObjectKey("").status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        r.setKind(ResumeKind.BUILT);

        ResumeDTO dto = resumeMapper.toDto(r);
        assertThat(dto.getKind()).isEqualTo(ResumeKind.BUILT);
        assertThat(dto.getTemplateId()).isNull();

        dto.setTemplateId("classic");
        assertThat(resumeMapper.toEntity(dto).getKind()).isEqualTo(ResumeKind.BUILT);
    }

    @Test
    void profileItemRoundTripsAndIsOrderedPerSectionWithoutSoftDeleted() {
        ProfileItem second = item(user, ProfileSection.EXPERIENCE, 2);
        ProfileItem first = item(user, ProfileSection.EXPERIENCE, 1);
        ProfileItem gone = item(user, ProfileSection.EXPERIENCE, 0);
        gone.setDeletedAt(Instant.now());
        ProfileItem skill = item(user, ProfileSection.SKILL, 0);
        profileItemRepository.saveAllAndFlush(List.of(second, first, gone, skill));
        clearContext();

        List<ProfileItem> experience = profileItemRepository.findByUserIdAndSectionAndDeletedAtIsNullOrderByPosition(
            user.getId(),
            ProfileSection.EXPERIENCE
        );
        assertThat(experience).extracting(ProfileItem::getPosition).containsExactly(1, 2);
        ProfileItem read = experience.get(0);
        assertThat(read.getSection()).isEqualTo(ProfileSection.EXPERIENCE);
        assertThat(read.getProvenance()).isEqualTo(Provenance.PARSED);
        assertThat(read.getSourceResumeId()).isEqualTo(42L);
        assertThat(read.isHidden()).isFalse();
        assertThat(read.getCreatedAt()).isNotNull();
        assertThat(read.getDataJson()).contains("Software Engineer").contains("Led a migration");

        assertThat(profileItemRepository.findByUserIdAndDeletedAtIsNullOrderBySectionAscPositionAsc(user.getId()))
            .hasSize(3);
    }

    @Test
    void profileItemIsOnlyFoundByItsOwner() {
        ProfileItem saved = profileItemRepository.saveAndFlush(item(user, ProfileSection.EDUCATION, 0));
        clearContext();

        assertThat(profileItemRepository.findByIdAndUserId(saved.getId(), user.getId())).isPresent();
        assertThat(profileItemRepository.findByIdAndUserId(saved.getId(), other.getId())).isEmpty();
    }

    @Test
    void resumeDocRoundTripsKeyedByItsResumeAndOwnedByUser() {
        Resume resume = newResume(user);
        ResumeDoc doc = new ResumeDoc();
        doc.setResume(resume);
        doc.setUser(user);
        doc.setDocJson(DOC_JSON);
        doc.setThemeJson(THEME_JSON);
        doc.setContentHash("a".repeat(64));
        resumeDocRepository.saveAndFlush(doc);
        clearContext();

        ResumeDoc read = resumeDocRepository.findByResumeIdAndUserId(resume.getId(), user.getId()).orElseThrow();
        assertThat(read.getResumeId()).isEqualTo(resume.getId());
        assertThat(read.getDocJson()).contains("\"schema\"");
        assertThat(read.getThemeJson()).contains("Inter");
        assertThat(read.getTemplateId()).isEqualTo("modern");
        assertThat(read.getContentHash()).hasSize(64);
        assertThat(read.getExportedAt()).isNull();
        assertThat(resumeDocRepository.findByResumeIdAndUserId(resume.getId(), other.getId())).isEmpty();
    }

    @Test
    void resumeDocVersionAdvancesOnEveryUpdate() {
        Resume resume = newResume(user);
        ResumeDoc doc = new ResumeDoc();
        doc.setResume(resume);
        doc.setUser(user);
        doc.setDocJson(DOC_JSON);
        doc.setThemeJson(THEME_JSON);
        doc.setContentHash("b".repeat(64));
        doc = resumeDocRepository.saveAndFlush(doc);
        int first = doc.getDocVersion();
        clearContext();

        ResumeDoc loaded = resumeDocRepository.findById(resume.getId()).orElseThrow();
        assertThat(loaded.getDocVersion()).isEqualTo(first);
        loaded.setTemplateId("classic");
        resumeDocRepository.saveAndFlush(loaded);

        assertThat(loaded.getDocVersion()).isGreaterThan(first);
    }

    @Test
    void deletingTheResumeCascadesToItsDocButNotToItsHistory() {
        Resume resume = newResume(user);
        ResumeDoc doc = new ResumeDoc();
        doc.setResume(resume);
        doc.setUser(user);
        doc.setDocJson(DOC_JSON);
        doc.setThemeJson(THEME_JSON);
        doc.setContentHash("c".repeat(64));
        resumeDocRepository.saveAndFlush(doc);
        resumeDocVersionRepository.saveAndFlush(version(user, resume.getId(), 1));
        clearContext();

        em.createNativeQuery("delete from resume where id = :id").setParameter("id", resume.getId()).executeUpdate();
        clearContext();

        assertThat(resumeDocRepository.findById(resume.getId())).isEmpty();
        assertThat(resumeDocVersionRepository.findByResumeIdAndUserIdOrderByVersionNoDesc(resume.getId(), user.getId())).hasSize(1);
    }

    @Test
    void resumeDocVersionsListNewestFirstAndAreOwnerScoped() {
        ResumeDocVersion v1 = resumeDocVersionRepository.save(version(user, 7L, 1));
        resumeDocVersionRepository.save(version(user, 7L, 2));
        resumeDocVersionRepository.flush();
        clearContext();

        List<ResumeDocVersion> versions = resumeDocVersionRepository.findByResumeIdAndUserIdOrderByVersionNoDesc(7L, user.getId());
        assertThat(versions).extracting(ResumeDocVersion::getVersionNo).containsExactly(2, 1);
        assertThat(versions.get(1).getReason()).isEqualTo("AUTOSAVE");
        assertThat(versions.get(1).getDocJson()).contains("schema");
        assertThat(resumeDocVersionRepository.findByIdAndUserId(v1.getId(), user.getId())).isPresent();
        assertThat(resumeDocVersionRepository.findByIdAndUserId(v1.getId(), other.getId())).isEmpty();
        assertThat(resumeDocVersionRepository.findByResumeIdAndUserIdOrderByVersionNoDesc(7L, other.getId())).isEmpty();
    }

    @Test
    void aiProposalRoundTripsDefaultsToOpenAndIsOwnerScoped() {
        ResumeAiProposal p = new ResumeAiProposal();
        p.setUser(user);
        p.setResumeId(7L);
        p.setContentHash("d".repeat(64));
        p.setTask("rewrite");
        p.setMode("stronger");
        p.setCacheKey("key-1");
        p.setResultJson("{\"changes\":[{\"ref\":\"b_1\",\"before\":\"x\",\"after\":\"y\"}]}");
        p = resumeAiProposalRepository.saveAndFlush(p);
        clearContext();

        ResumeAiProposal read = resumeAiProposalRepository.findByIdAndUserId(p.getId(), user.getId()).orElseThrow();
        assertThat(read.getStatus()).isEqualTo(ResumeAiProposal.STATUS_OPEN);
        assertThat(read.getTask()).isEqualTo("rewrite");
        assertThat(read.getResultJson()).contains("\"after\"");
        assertThat(resumeAiProposalRepository.findByIdAndUserId(p.getId(), other.getId())).isEmpty();
        Optional<ResumeAiProposal> byKey = resumeAiProposalRepository.findFirstByUserIdAndCacheKeyOrderByCreatedAtDesc(user.getId(), "key-1");
        assertThat(byKey).isPresent();
    }

    private ProfileItem item(User owner, ProfileSection section, int position) {
        ProfileItem p = new ProfileItem();
        p.setUser(owner);
        p.setSection(section);
        p.setPosition(position);
        p.setDataJson(ITEM_JSON);
        p.setProvenance(Provenance.PARSED);
        p.setSourceResumeId(42L);
        return p;
    }

    private ResumeDocVersion version(User owner, Long resumeId, int no) {
        ResumeDocVersion v = new ResumeDocVersion();
        v.setUser(owner);
        v.setResumeId(resumeId);
        v.setVersionNo(no);
        v.setReason("AUTOSAVE");
        v.setDocJson(DOC_JSON);
        v.setTemplateId("modern");
        v.setThemeJson(THEME_JSON);
        v.setContentHash("e".repeat(64));
        return v;
    }
}
