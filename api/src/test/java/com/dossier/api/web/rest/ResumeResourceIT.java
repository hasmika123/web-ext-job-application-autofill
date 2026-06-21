package com.dossier.api.web.rest;

import static com.dossier.api.domain.ResumeAsserts.*;
import static com.dossier.api.web.rest.TestUtil.createUpdateProxyForBean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ResumeService;
import com.dossier.api.service.dto.ResumeDTO;
import com.dossier.api.service.mapper.ResumeMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Random;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for the {@link ResumeResource} REST controller.
 */
@IntegrationTest
@ExtendWith(MockitoExtension.class)
@AutoConfigureMockMvc
@WithMockUser
class ResumeResourceIT {

    private static final String DEFAULT_LABEL = "AAAAAAAAAA";
    private static final String UPDATED_LABEL = "BBBBBBBBBB";

    private static final String DEFAULT_R_2_OBJECT_KEY = "AAAAAAAAAA";
    private static final String UPDATED_R_2_OBJECT_KEY = "BBBBBBBBBB";

    private static final String DEFAULT_PARSED_JSON = "AAAAAAAAAA";
    private static final String UPDATED_PARSED_JSON = "BBBBBBBBBB";

    private static final ResumeStatus DEFAULT_STATUS = ResumeStatus.NEEDS_REVIEW;
    private static final ResumeStatus UPDATED_STATUS = ResumeStatus.CONFIRMED;

    private static final Instant DEFAULT_CREATED_AT = Instant.ofEpochMilli(0L);
    private static final Instant UPDATED_CREATED_AT = Instant.now().truncatedTo(ChronoUnit.MILLIS);

    private static final String ENTITY_API_URL = "/api/resumes";
    private static final String ENTITY_API_URL_ID = ENTITY_API_URL + "/{id}";

    private static Random random = new Random();
    private static AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));

    @Autowired
    private ObjectMapper om;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private UserRepository userRepository;

    @Mock
    private ResumeRepository resumeRepositoryMock;

    @Autowired
    private ResumeMapper resumeMapper;

    @Mock
    private ResumeService resumeServiceMock;

    @Autowired
    private EntityManager em;

    @Autowired
    private MockMvc restResumeMockMvc;

    private Resume resume;

    private Resume insertedResume;

    /**
     * Create an entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static Resume createEntity() {
        return new Resume()
            .label(DEFAULT_LABEL)
            .r2ObjectKey(DEFAULT_R_2_OBJECT_KEY)
            .parsedJson(DEFAULT_PARSED_JSON)
            .status(DEFAULT_STATUS)
            .createdAt(DEFAULT_CREATED_AT);
    }

    /**
     * Create an updated entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static Resume createUpdatedEntity() {
        return new Resume()
            .label(UPDATED_LABEL)
            .r2ObjectKey(UPDATED_R_2_OBJECT_KEY)
            .parsedJson(UPDATED_PARSED_JSON)
            .status(UPDATED_STATUS)
            .createdAt(UPDATED_CREATED_AT);
    }

    @BeforeEach
    void initTest() {
        resume = createEntity();
    }

    @AfterEach
    void cleanup() {
        if (insertedResume != null) {
            resumeRepository.delete(insertedResume);
            insertedResume = null;
        }
    }

    @Test
    @Transactional
    void createResume() throws Exception {
        long databaseSizeBeforeCreate = getRepositoryCount();
        // Create the Resume
        ResumeDTO resumeDTO = resumeMapper.toDto(resume);
        var returnedResumeDTO = om.readValue(
            restResumeMockMvc
                .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(resumeDTO)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString(),
            ResumeDTO.class
        );

        // Validate the Resume in the database
        assertIncrementedRepositoryCount(databaseSizeBeforeCreate);
        var returnedResume = resumeMapper.toEntity(returnedResumeDTO);
        assertResumeUpdatableFieldsEquals(returnedResume, getPersistedResume(returnedResume));

        insertedResume = returnedResume;
    }

    @Test
    @Transactional
    void createResumeWithExistingId() throws Exception {
        // Create the Resume with an existing ID
        resume.setId(1L);
        ResumeDTO resumeDTO = resumeMapper.toDto(resume);

        long databaseSizeBeforeCreate = getRepositoryCount();

        // An entity with an existing ID cannot be created, so this API call must fail
        restResumeMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(resumeDTO)))
            .andExpect(status().isBadRequest());

        // Validate the Resume in the database
        assertSameRepositoryCount(databaseSizeBeforeCreate);
    }

    @Test
    @Transactional
    void checkLabelIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        resume.setLabel(null);

        // Create the Resume, which fails.
        ResumeDTO resumeDTO = resumeMapper.toDto(resume);

        restResumeMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(resumeDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void checkr2ObjectKeyIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        resume.setr2ObjectKey(null);

        // Create the Resume, which fails.
        ResumeDTO resumeDTO = resumeMapper.toDto(resume);

        restResumeMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(resumeDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void checkStatusIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        resume.setStatus(null);

        // Create the Resume, which fails.
        ResumeDTO resumeDTO = resumeMapper.toDto(resume);

        restResumeMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(resumeDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void checkCreatedAtIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        resume.setCreatedAt(null);

        // Create the Resume, which fails.
        ResumeDTO resumeDTO = resumeMapper.toDto(resume);

        restResumeMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(resumeDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void getAllResumes() throws Exception {
        // Initialize the database
        insertedResume = resumeRepository.saveAndFlush(resume);

        // Get all the resumeList
        restResumeMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.[*].id").value(hasItem(resume.getId().intValue())))
            .andExpect(jsonPath("$.[*].label").value(hasItem(DEFAULT_LABEL)))
            .andExpect(jsonPath("$.[*].r2ObjectKey").value(hasItem(DEFAULT_R_2_OBJECT_KEY)))
            .andExpect(jsonPath("$.[*].parsedJson").value(hasItem(DEFAULT_PARSED_JSON)))
            .andExpect(jsonPath("$.[*].status").value(hasItem(DEFAULT_STATUS.toString())))
            .andExpect(jsonPath("$.[*].createdAt").value(hasItem(DEFAULT_CREATED_AT.toString())));
    }

    @SuppressWarnings({ "unchecked" })
    void getAllResumesWithEagerRelationshipsIsEnabled() throws Exception {
        when(resumeServiceMock.findAllWithEagerRelationships(any())).thenReturn(new PageImpl(new ArrayList<>()));

        restResumeMockMvc.perform(get(ENTITY_API_URL + "?eagerload=true")).andExpect(status().isOk());

        verify(resumeServiceMock, times(1)).findAllWithEagerRelationships(any());
    }

    @SuppressWarnings({ "unchecked" })
    void getAllResumesWithEagerRelationshipsIsNotEnabled() throws Exception {
        when(resumeServiceMock.findAllWithEagerRelationships(any())).thenReturn(new PageImpl(new ArrayList<>()));

        restResumeMockMvc.perform(get(ENTITY_API_URL + "?eagerload=false")).andExpect(status().isOk());
        verify(resumeRepositoryMock, times(1)).findAll(any(Pageable.class));
    }

    @Test
    @Transactional
    void getResume() throws Exception {
        // Initialize the database
        insertedResume = resumeRepository.saveAndFlush(resume);

        // Get the resume
        restResumeMockMvc
            .perform(get(ENTITY_API_URL_ID, resume.getId()))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.id").value(resume.getId().intValue()))
            .andExpect(jsonPath("$.label").value(DEFAULT_LABEL))
            .andExpect(jsonPath("$.r2ObjectKey").value(DEFAULT_R_2_OBJECT_KEY))
            .andExpect(jsonPath("$.parsedJson").value(DEFAULT_PARSED_JSON))
            .andExpect(jsonPath("$.status").value(DEFAULT_STATUS.toString()))
            .andExpect(jsonPath("$.createdAt").value(DEFAULT_CREATED_AT.toString()));
    }

    @Test
    @Transactional
    void getNonExistingResume() throws Exception {
        // Get the resume
        restResumeMockMvc.perform(get(ENTITY_API_URL_ID, Long.MAX_VALUE)).andExpect(status().isNotFound());
    }

    @Test
    @Transactional
    void putExistingResume() throws Exception {
        // Initialize the database
        insertedResume = resumeRepository.saveAndFlush(resume);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the resume
        Resume updatedResume = resumeRepository.findById(resume.getId()).orElseThrow();
        // Disconnect from session so that the updates on updatedResume are not directly saved in db
        em.detach(updatedResume);
        updatedResume
            .label(UPDATED_LABEL)
            .r2ObjectKey(UPDATED_R_2_OBJECT_KEY)
            .parsedJson(UPDATED_PARSED_JSON)
            .status(UPDATED_STATUS)
            .createdAt(UPDATED_CREATED_AT);
        ResumeDTO resumeDTO = resumeMapper.toDto(updatedResume);

        restResumeMockMvc
            .perform(
                put(ENTITY_API_URL_ID, resumeDTO.getId()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(resumeDTO))
            )
            .andExpect(status().isOk());

        // Validate the Resume in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertPersistedResumeToMatchAllProperties(updatedResume);
    }

    @Test
    @Transactional
    void putNonExistingResume() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        resume.setId(longCount.incrementAndGet());

        // Create the Resume
        ResumeDTO resumeDTO = resumeMapper.toDto(resume);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restResumeMockMvc
            .perform(
                put(ENTITY_API_URL_ID, resumeDTO.getId()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(resumeDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Resume in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithIdMismatchResume() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        resume.setId(longCount.incrementAndGet());

        // Create the Resume
        ResumeDTO resumeDTO = resumeMapper.toDto(resume);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restResumeMockMvc
            .perform(
                put(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(resumeDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Resume in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithMissingIdPathParamResume() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        resume.setId(longCount.incrementAndGet());

        // Create the Resume
        ResumeDTO resumeDTO = resumeMapper.toDto(resume);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restResumeMockMvc
            .perform(put(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(resumeDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the Resume in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void partialUpdateResumeWithPatch() throws Exception {
        // Initialize the database
        insertedResume = resumeRepository.saveAndFlush(resume);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the resume using partial update
        Resume partialUpdatedResume = new Resume();
        partialUpdatedResume.setId(resume.getId());

        partialUpdatedResume.r2ObjectKey(UPDATED_R_2_OBJECT_KEY).status(UPDATED_STATUS);

        restResumeMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedResume.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedResume))
            )
            .andExpect(status().isOk());

        // Validate the Resume in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertResumeUpdatableFieldsEquals(createUpdateProxyForBean(partialUpdatedResume, resume), getPersistedResume(resume));
    }

    @Test
    @Transactional
    void fullUpdateResumeWithPatch() throws Exception {
        // Initialize the database
        insertedResume = resumeRepository.saveAndFlush(resume);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the resume using partial update
        Resume partialUpdatedResume = new Resume();
        partialUpdatedResume.setId(resume.getId());

        partialUpdatedResume
            .label(UPDATED_LABEL)
            .r2ObjectKey(UPDATED_R_2_OBJECT_KEY)
            .parsedJson(UPDATED_PARSED_JSON)
            .status(UPDATED_STATUS)
            .createdAt(UPDATED_CREATED_AT);

        restResumeMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedResume.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedResume))
            )
            .andExpect(status().isOk());

        // Validate the Resume in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertResumeUpdatableFieldsEquals(partialUpdatedResume, getPersistedResume(partialUpdatedResume));
    }

    @Test
    @Transactional
    void patchNonExistingResume() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        resume.setId(longCount.incrementAndGet());

        // Create the Resume
        ResumeDTO resumeDTO = resumeMapper.toDto(resume);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restResumeMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, resumeDTO.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(resumeDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Resume in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithIdMismatchResume() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        resume.setId(longCount.incrementAndGet());

        // Create the Resume
        ResumeDTO resumeDTO = resumeMapper.toDto(resume);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restResumeMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(resumeDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Resume in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithMissingIdPathParamResume() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        resume.setId(longCount.incrementAndGet());

        // Create the Resume
        ResumeDTO resumeDTO = resumeMapper.toDto(resume);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restResumeMockMvc
            .perform(patch(ENTITY_API_URL).contentType("application/merge-patch+json").content(om.writeValueAsBytes(resumeDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the Resume in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void deleteResume() throws Exception {
        // Initialize the database
        insertedResume = resumeRepository.saveAndFlush(resume);

        long databaseSizeBeforeDelete = getRepositoryCount();

        // Delete the resume
        restResumeMockMvc
            .perform(delete(ENTITY_API_URL_ID, resume.getId()).accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNoContent());

        // Validate the database contains one less item
        assertDecrementedRepositoryCount(databaseSizeBeforeDelete);
    }

    protected long getRepositoryCount() {
        return resumeRepository.count();
    }

    protected void assertIncrementedRepositoryCount(long countBefore) {
        assertThat(countBefore + 1).isEqualTo(getRepositoryCount());
    }

    protected void assertDecrementedRepositoryCount(long countBefore) {
        assertThat(countBefore - 1).isEqualTo(getRepositoryCount());
    }

    protected void assertSameRepositoryCount(long countBefore) {
        assertThat(countBefore).isEqualTo(getRepositoryCount());
    }

    protected Resume getPersistedResume(Resume resume) {
        return resumeRepository.findById(resume.getId()).orElseThrow();
    }

    protected void assertPersistedResumeToMatchAllProperties(Resume expectedResume) {
        assertResumeAllPropertiesEquals(expectedResume, getPersistedResume(expectedResume));
    }

    protected void assertPersistedResumeToMatchUpdatableProperties(Resume expectedResume) {
        assertResumeAllUpdatablePropertiesEquals(expectedResume, getPersistedResume(expectedResume));
    }
}
