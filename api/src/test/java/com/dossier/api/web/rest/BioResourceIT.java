package com.dossier.api.web.rest;

import static com.dossier.api.domain.BioAsserts.*;
import static com.dossier.api.web.rest.TestUtil.createUpdateProxyForBean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.domain.Bio;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.BioService;
import com.dossier.api.service.dto.BioDTO;
import com.dossier.api.service.mapper.BioMapper;
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
 * Integration tests for the {@link BioResource} REST controller.
 */
@IntegrationTest
@ExtendWith(MockitoExtension.class)
@AutoConfigureMockMvc
@WithMockUser(authorities = AuthoritiesConstants.ADMIN)
class BioResourceIT {

    private static final String DEFAULT_PAYLOAD = "AAAAAAAAAA";
    private static final String UPDATED_PAYLOAD = "BBBBBBBBBB";

    private static final Instant DEFAULT_UPDATED_AT = Instant.ofEpochMilli(0L);
    private static final Instant UPDATED_UPDATED_AT = Instant.now().truncatedTo(ChronoUnit.MILLIS);

    private static final String ENTITY_API_URL = "/api/bios";
    private static final String ENTITY_API_URL_ID = ENTITY_API_URL + "/{id}";

    private static Random random = new Random();
    private static AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));

    @Autowired
    private ObjectMapper om;

    @Autowired
    private BioRepository bioRepository;

    @Autowired
    private UserRepository userRepository;

    @Mock
    private BioRepository bioRepositoryMock;

    @Autowired
    private BioMapper bioMapper;

    @Mock
    private BioService bioServiceMock;

    @Autowired
    private EntityManager em;

    @Autowired
    private MockMvc restBioMockMvc;

    private Bio bio;

    private Bio insertedBio;

    /**
     * Create an entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static Bio createEntity() {
        return new Bio().payload(DEFAULT_PAYLOAD).updatedAt(DEFAULT_UPDATED_AT);
    }

    /**
     * Create an updated entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static Bio createUpdatedEntity() {
        return new Bio().payload(UPDATED_PAYLOAD).updatedAt(UPDATED_UPDATED_AT);
    }

    @BeforeEach
    void initTest() {
        bio = createEntity();
    }

    @AfterEach
    void cleanup() {
        if (insertedBio != null) {
            bioRepository.delete(insertedBio);
            insertedBio = null;
        }
    }

    @Test
    @Transactional
    void createBio() throws Exception {
        long databaseSizeBeforeCreate = getRepositoryCount();
        // Create the Bio
        BioDTO bioDTO = bioMapper.toDto(bio);
        var returnedBioDTO = om.readValue(
            restBioMockMvc
                .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(bioDTO)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString(),
            BioDTO.class
        );

        // Validate the Bio in the database
        assertIncrementedRepositoryCount(databaseSizeBeforeCreate);
        var returnedBio = bioMapper.toEntity(returnedBioDTO);
        assertBioUpdatableFieldsEquals(returnedBio, getPersistedBio(returnedBio));

        insertedBio = returnedBio;
    }

    @Test
    @Transactional
    void createBioWithExistingId() throws Exception {
        // Create the Bio with an existing ID
        bio.setId(1L);
        BioDTO bioDTO = bioMapper.toDto(bio);

        long databaseSizeBeforeCreate = getRepositoryCount();

        // An entity with an existing ID cannot be created, so this API call must fail
        restBioMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(bioDTO)))
            .andExpect(status().isBadRequest());

        // Validate the Bio in the database
        assertSameRepositoryCount(databaseSizeBeforeCreate);
    }

    @Test
    @Transactional
    void checkUpdatedAtIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        bio.setUpdatedAt(null);

        // Create the Bio, which fails.
        BioDTO bioDTO = bioMapper.toDto(bio);

        restBioMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(bioDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void getAllBios() throws Exception {
        // Initialize the database
        insertedBio = bioRepository.saveAndFlush(bio);

        // Get all the bioList
        restBioMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.[*].id").value(hasItem(bio.getId().intValue())))
            .andExpect(jsonPath("$.[*].payload").value(hasItem(DEFAULT_PAYLOAD)))
            .andExpect(jsonPath("$.[*].updatedAt").value(hasItem(DEFAULT_UPDATED_AT.toString())));
    }

    @SuppressWarnings({ "unchecked" })
    void getAllBiosWithEagerRelationshipsIsEnabled() throws Exception {
        when(bioServiceMock.findAllWithEagerRelationships(any())).thenReturn(new PageImpl(new ArrayList<>()));

        restBioMockMvc.perform(get(ENTITY_API_URL + "?eagerload=true")).andExpect(status().isOk());

        verify(bioServiceMock, times(1)).findAllWithEagerRelationships(any());
    }

    @SuppressWarnings({ "unchecked" })
    void getAllBiosWithEagerRelationshipsIsNotEnabled() throws Exception {
        when(bioServiceMock.findAllWithEagerRelationships(any())).thenReturn(new PageImpl(new ArrayList<>()));

        restBioMockMvc.perform(get(ENTITY_API_URL + "?eagerload=false")).andExpect(status().isOk());
        verify(bioRepositoryMock, times(1)).findAll(any(Pageable.class));
    }

    @Test
    @Transactional
    void getBio() throws Exception {
        // Initialize the database
        insertedBio = bioRepository.saveAndFlush(bio);

        // Get the bio
        restBioMockMvc
            .perform(get(ENTITY_API_URL_ID, bio.getId()))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.id").value(bio.getId().intValue()))
            .andExpect(jsonPath("$.payload").value(DEFAULT_PAYLOAD))
            .andExpect(jsonPath("$.updatedAt").value(DEFAULT_UPDATED_AT.toString()));
    }

    @Test
    @Transactional
    void getNonExistingBio() throws Exception {
        // Get the bio
        restBioMockMvc.perform(get(ENTITY_API_URL_ID, Long.MAX_VALUE)).andExpect(status().isNotFound());
    }

    @Test
    @Transactional
    void putExistingBio() throws Exception {
        // Initialize the database
        insertedBio = bioRepository.saveAndFlush(bio);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the bio
        Bio updatedBio = bioRepository.findById(bio.getId()).orElseThrow();
        // Disconnect from session so that the updates on updatedBio are not directly saved in db
        em.detach(updatedBio);
        updatedBio.payload(UPDATED_PAYLOAD).updatedAt(UPDATED_UPDATED_AT);
        BioDTO bioDTO = bioMapper.toDto(updatedBio);

        restBioMockMvc
            .perform(put(ENTITY_API_URL_ID, bioDTO.getId()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(bioDTO)))
            .andExpect(status().isOk());

        // Validate the Bio in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertPersistedBioToMatchAllProperties(updatedBio);
    }

    @Test
    @Transactional
    void putNonExistingBio() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        bio.setId(longCount.incrementAndGet());

        // Create the Bio
        BioDTO bioDTO = bioMapper.toDto(bio);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restBioMockMvc
            .perform(put(ENTITY_API_URL_ID, bioDTO.getId()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(bioDTO)))
            .andExpect(status().isBadRequest());

        // Validate the Bio in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithIdMismatchBio() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        bio.setId(longCount.incrementAndGet());

        // Create the Bio
        BioDTO bioDTO = bioMapper.toDto(bio);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restBioMockMvc
            .perform(
                put(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(bioDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Bio in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithMissingIdPathParamBio() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        bio.setId(longCount.incrementAndGet());

        // Create the Bio
        BioDTO bioDTO = bioMapper.toDto(bio);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restBioMockMvc
            .perform(put(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(bioDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the Bio in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void partialUpdateBioWithPatch() throws Exception {
        // Initialize the database
        insertedBio = bioRepository.saveAndFlush(bio);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the bio using partial update
        Bio partialUpdatedBio = new Bio();
        partialUpdatedBio.setId(bio.getId());

        partialUpdatedBio.payload(UPDATED_PAYLOAD).updatedAt(UPDATED_UPDATED_AT);

        restBioMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedBio.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedBio))
            )
            .andExpect(status().isOk());

        // Validate the Bio in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertBioUpdatableFieldsEquals(createUpdateProxyForBean(partialUpdatedBio, bio), getPersistedBio(bio));
    }

    @Test
    @Transactional
    void fullUpdateBioWithPatch() throws Exception {
        // Initialize the database
        insertedBio = bioRepository.saveAndFlush(bio);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the bio using partial update
        Bio partialUpdatedBio = new Bio();
        partialUpdatedBio.setId(bio.getId());

        partialUpdatedBio.payload(UPDATED_PAYLOAD).updatedAt(UPDATED_UPDATED_AT);

        restBioMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedBio.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedBio))
            )
            .andExpect(status().isOk());

        // Validate the Bio in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertBioUpdatableFieldsEquals(partialUpdatedBio, getPersistedBio(partialUpdatedBio));
    }

    @Test
    @Transactional
    void patchNonExistingBio() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        bio.setId(longCount.incrementAndGet());

        // Create the Bio
        BioDTO bioDTO = bioMapper.toDto(bio);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restBioMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, bioDTO.getId()).contentType("application/merge-patch+json").content(om.writeValueAsBytes(bioDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Bio in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithIdMismatchBio() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        bio.setId(longCount.incrementAndGet());

        // Create the Bio
        BioDTO bioDTO = bioMapper.toDto(bio);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restBioMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(bioDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Bio in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithMissingIdPathParamBio() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        bio.setId(longCount.incrementAndGet());

        // Create the Bio
        BioDTO bioDTO = bioMapper.toDto(bio);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restBioMockMvc
            .perform(patch(ENTITY_API_URL).contentType("application/merge-patch+json").content(om.writeValueAsBytes(bioDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the Bio in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void deleteBio() throws Exception {
        // Initialize the database
        insertedBio = bioRepository.saveAndFlush(bio);

        long databaseSizeBeforeDelete = getRepositoryCount();

        // Delete the bio
        restBioMockMvc.perform(delete(ENTITY_API_URL_ID, bio.getId()).accept(MediaType.APPLICATION_JSON)).andExpect(status().isNoContent());

        // Validate the database contains one less item
        assertDecrementedRepositoryCount(databaseSizeBeforeDelete);
    }

    protected long getRepositoryCount() {
        return bioRepository.count();
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

    protected Bio getPersistedBio(Bio bio) {
        return bioRepository.findById(bio.getId()).orElseThrow();
    }

    protected void assertPersistedBioToMatchAllProperties(Bio expectedBio) {
        assertBioAllPropertiesEquals(expectedBio, getPersistedBio(expectedBio));
    }

    protected void assertPersistedBioToMatchUpdatableProperties(Bio expectedBio) {
        assertBioAllUpdatablePropertiesEquals(expectedBio, getPersistedBio(expectedBio));
    }
}
