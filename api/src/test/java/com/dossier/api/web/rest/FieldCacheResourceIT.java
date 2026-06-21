package com.dossier.api.web.rest;

import static com.dossier.api.domain.FieldCacheAsserts.*;
import static com.dossier.api.web.rest.TestUtil.createUpdateProxyForBean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.FieldCache;
import com.dossier.api.repository.FieldCacheRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.FieldCacheService;
import com.dossier.api.service.dto.FieldCacheDTO;
import com.dossier.api.service.mapper.FieldCacheMapper;
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
 * Integration tests for the {@link FieldCacheResource} REST controller.
 */
@IntegrationTest
@ExtendWith(MockitoExtension.class)
@AutoConfigureMockMvc
@WithMockUser
class FieldCacheResourceIT {

    private static final String DEFAULT_FIELD_KEY = "AAAAAAAAAA";
    private static final String UPDATED_FIELD_KEY = "BBBBBBBBBB";

    private static final String DEFAULT_CONTEXT_HASH = "AAAAAAAAAA";
    private static final String UPDATED_CONTEXT_HASH = "BBBBBBBBBB";

    private static final String DEFAULT_VALUE = "AAAAAAAAAA";
    private static final String UPDATED_VALUE = "BBBBBBBBBB";

    private static final Integer DEFAULT_HIT_COUNT = 1;
    private static final Integer UPDATED_HIT_COUNT = 2;

    private static final Instant DEFAULT_UPDATED_AT = Instant.ofEpochMilli(0L);
    private static final Instant UPDATED_UPDATED_AT = Instant.now().truncatedTo(ChronoUnit.MILLIS);

    private static final String ENTITY_API_URL = "/api/field-caches";
    private static final String ENTITY_API_URL_ID = ENTITY_API_URL + "/{id}";

    private static Random random = new Random();
    private static AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));

    @Autowired
    private ObjectMapper om;

    @Autowired
    private FieldCacheRepository fieldCacheRepository;

    @Autowired
    private UserRepository userRepository;

    @Mock
    private FieldCacheRepository fieldCacheRepositoryMock;

    @Autowired
    private FieldCacheMapper fieldCacheMapper;

    @Mock
    private FieldCacheService fieldCacheServiceMock;

    @Autowired
    private EntityManager em;

    @Autowired
    private MockMvc restFieldCacheMockMvc;

    private FieldCache fieldCache;

    private FieldCache insertedFieldCache;

    /**
     * Create an entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static FieldCache createEntity() {
        return new FieldCache()
            .fieldKey(DEFAULT_FIELD_KEY)
            .contextHash(DEFAULT_CONTEXT_HASH)
            .value(DEFAULT_VALUE)
            .hitCount(DEFAULT_HIT_COUNT)
            .updatedAt(DEFAULT_UPDATED_AT);
    }

    /**
     * Create an updated entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static FieldCache createUpdatedEntity() {
        return new FieldCache()
            .fieldKey(UPDATED_FIELD_KEY)
            .contextHash(UPDATED_CONTEXT_HASH)
            .value(UPDATED_VALUE)
            .hitCount(UPDATED_HIT_COUNT)
            .updatedAt(UPDATED_UPDATED_AT);
    }

    @BeforeEach
    void initTest() {
        fieldCache = createEntity();
    }

    @AfterEach
    void cleanup() {
        if (insertedFieldCache != null) {
            fieldCacheRepository.delete(insertedFieldCache);
            insertedFieldCache = null;
        }
    }

    @Test
    @Transactional
    void createFieldCache() throws Exception {
        long databaseSizeBeforeCreate = getRepositoryCount();
        // Create the FieldCache
        FieldCacheDTO fieldCacheDTO = fieldCacheMapper.toDto(fieldCache);
        var returnedFieldCacheDTO = om.readValue(
            restFieldCacheMockMvc
                .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(fieldCacheDTO)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString(),
            FieldCacheDTO.class
        );

        // Validate the FieldCache in the database
        assertIncrementedRepositoryCount(databaseSizeBeforeCreate);
        var returnedFieldCache = fieldCacheMapper.toEntity(returnedFieldCacheDTO);
        assertFieldCacheUpdatableFieldsEquals(returnedFieldCache, getPersistedFieldCache(returnedFieldCache));

        insertedFieldCache = returnedFieldCache;
    }

    @Test
    @Transactional
    void createFieldCacheWithExistingId() throws Exception {
        // Create the FieldCache with an existing ID
        fieldCache.setId(1L);
        FieldCacheDTO fieldCacheDTO = fieldCacheMapper.toDto(fieldCache);

        long databaseSizeBeforeCreate = getRepositoryCount();

        // An entity with an existing ID cannot be created, so this API call must fail
        restFieldCacheMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(fieldCacheDTO)))
            .andExpect(status().isBadRequest());

        // Validate the FieldCache in the database
        assertSameRepositoryCount(databaseSizeBeforeCreate);
    }

    @Test
    @Transactional
    void checkFieldKeyIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        fieldCache.setFieldKey(null);

        // Create the FieldCache, which fails.
        FieldCacheDTO fieldCacheDTO = fieldCacheMapper.toDto(fieldCache);

        restFieldCacheMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(fieldCacheDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void checkContextHashIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        fieldCache.setContextHash(null);

        // Create the FieldCache, which fails.
        FieldCacheDTO fieldCacheDTO = fieldCacheMapper.toDto(fieldCache);

        restFieldCacheMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(fieldCacheDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void checkHitCountIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        fieldCache.setHitCount(null);

        // Create the FieldCache, which fails.
        FieldCacheDTO fieldCacheDTO = fieldCacheMapper.toDto(fieldCache);

        restFieldCacheMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(fieldCacheDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void checkUpdatedAtIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        fieldCache.setUpdatedAt(null);

        // Create the FieldCache, which fails.
        FieldCacheDTO fieldCacheDTO = fieldCacheMapper.toDto(fieldCache);

        restFieldCacheMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(fieldCacheDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void getAllFieldCaches() throws Exception {
        // Initialize the database
        insertedFieldCache = fieldCacheRepository.saveAndFlush(fieldCache);

        // Get all the fieldCacheList
        restFieldCacheMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.[*].id").value(hasItem(fieldCache.getId().intValue())))
            .andExpect(jsonPath("$.[*].fieldKey").value(hasItem(DEFAULT_FIELD_KEY)))
            .andExpect(jsonPath("$.[*].contextHash").value(hasItem(DEFAULT_CONTEXT_HASH)))
            .andExpect(jsonPath("$.[*].value").value(hasItem(DEFAULT_VALUE)))
            .andExpect(jsonPath("$.[*].hitCount").value(hasItem(DEFAULT_HIT_COUNT)))
            .andExpect(jsonPath("$.[*].updatedAt").value(hasItem(DEFAULT_UPDATED_AT.toString())));
    }

    @SuppressWarnings({ "unchecked" })
    void getAllFieldCachesWithEagerRelationshipsIsEnabled() throws Exception {
        when(fieldCacheServiceMock.findAllWithEagerRelationships(any())).thenReturn(new PageImpl(new ArrayList<>()));

        restFieldCacheMockMvc.perform(get(ENTITY_API_URL + "?eagerload=true")).andExpect(status().isOk());

        verify(fieldCacheServiceMock, times(1)).findAllWithEagerRelationships(any());
    }

    @SuppressWarnings({ "unchecked" })
    void getAllFieldCachesWithEagerRelationshipsIsNotEnabled() throws Exception {
        when(fieldCacheServiceMock.findAllWithEagerRelationships(any())).thenReturn(new PageImpl(new ArrayList<>()));

        restFieldCacheMockMvc.perform(get(ENTITY_API_URL + "?eagerload=false")).andExpect(status().isOk());
        verify(fieldCacheRepositoryMock, times(1)).findAll(any(Pageable.class));
    }

    @Test
    @Transactional
    void getFieldCache() throws Exception {
        // Initialize the database
        insertedFieldCache = fieldCacheRepository.saveAndFlush(fieldCache);

        // Get the fieldCache
        restFieldCacheMockMvc
            .perform(get(ENTITY_API_URL_ID, fieldCache.getId()))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.id").value(fieldCache.getId().intValue()))
            .andExpect(jsonPath("$.fieldKey").value(DEFAULT_FIELD_KEY))
            .andExpect(jsonPath("$.contextHash").value(DEFAULT_CONTEXT_HASH))
            .andExpect(jsonPath("$.value").value(DEFAULT_VALUE))
            .andExpect(jsonPath("$.hitCount").value(DEFAULT_HIT_COUNT))
            .andExpect(jsonPath("$.updatedAt").value(DEFAULT_UPDATED_AT.toString()));
    }

    @Test
    @Transactional
    void getNonExistingFieldCache() throws Exception {
        // Get the fieldCache
        restFieldCacheMockMvc.perform(get(ENTITY_API_URL_ID, Long.MAX_VALUE)).andExpect(status().isNotFound());
    }

    @Test
    @Transactional
    void putExistingFieldCache() throws Exception {
        // Initialize the database
        insertedFieldCache = fieldCacheRepository.saveAndFlush(fieldCache);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the fieldCache
        FieldCache updatedFieldCache = fieldCacheRepository.findById(fieldCache.getId()).orElseThrow();
        // Disconnect from session so that the updates on updatedFieldCache are not directly saved in db
        em.detach(updatedFieldCache);
        updatedFieldCache
            .fieldKey(UPDATED_FIELD_KEY)
            .contextHash(UPDATED_CONTEXT_HASH)
            .value(UPDATED_VALUE)
            .hitCount(UPDATED_HIT_COUNT)
            .updatedAt(UPDATED_UPDATED_AT);
        FieldCacheDTO fieldCacheDTO = fieldCacheMapper.toDto(updatedFieldCache);

        restFieldCacheMockMvc
            .perform(
                put(ENTITY_API_URL_ID, fieldCacheDTO.getId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(fieldCacheDTO))
            )
            .andExpect(status().isOk());

        // Validate the FieldCache in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertPersistedFieldCacheToMatchAllProperties(updatedFieldCache);
    }

    @Test
    @Transactional
    void putNonExistingFieldCache() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        fieldCache.setId(longCount.incrementAndGet());

        // Create the FieldCache
        FieldCacheDTO fieldCacheDTO = fieldCacheMapper.toDto(fieldCache);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restFieldCacheMockMvc
            .perform(
                put(ENTITY_API_URL_ID, fieldCacheDTO.getId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(fieldCacheDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the FieldCache in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithIdMismatchFieldCache() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        fieldCache.setId(longCount.incrementAndGet());

        // Create the FieldCache
        FieldCacheDTO fieldCacheDTO = fieldCacheMapper.toDto(fieldCache);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restFieldCacheMockMvc
            .perform(
                put(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(fieldCacheDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the FieldCache in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithMissingIdPathParamFieldCache() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        fieldCache.setId(longCount.incrementAndGet());

        // Create the FieldCache
        FieldCacheDTO fieldCacheDTO = fieldCacheMapper.toDto(fieldCache);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restFieldCacheMockMvc
            .perform(put(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(fieldCacheDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the FieldCache in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void partialUpdateFieldCacheWithPatch() throws Exception {
        // Initialize the database
        insertedFieldCache = fieldCacheRepository.saveAndFlush(fieldCache);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the fieldCache using partial update
        FieldCache partialUpdatedFieldCache = new FieldCache();
        partialUpdatedFieldCache.setId(fieldCache.getId());

        partialUpdatedFieldCache
            .contextHash(UPDATED_CONTEXT_HASH)
            .value(UPDATED_VALUE)
            .hitCount(UPDATED_HIT_COUNT)
            .updatedAt(UPDATED_UPDATED_AT);

        restFieldCacheMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedFieldCache.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedFieldCache))
            )
            .andExpect(status().isOk());

        // Validate the FieldCache in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertFieldCacheUpdatableFieldsEquals(
            createUpdateProxyForBean(partialUpdatedFieldCache, fieldCache),
            getPersistedFieldCache(fieldCache)
        );
    }

    @Test
    @Transactional
    void fullUpdateFieldCacheWithPatch() throws Exception {
        // Initialize the database
        insertedFieldCache = fieldCacheRepository.saveAndFlush(fieldCache);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the fieldCache using partial update
        FieldCache partialUpdatedFieldCache = new FieldCache();
        partialUpdatedFieldCache.setId(fieldCache.getId());

        partialUpdatedFieldCache
            .fieldKey(UPDATED_FIELD_KEY)
            .contextHash(UPDATED_CONTEXT_HASH)
            .value(UPDATED_VALUE)
            .hitCount(UPDATED_HIT_COUNT)
            .updatedAt(UPDATED_UPDATED_AT);

        restFieldCacheMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedFieldCache.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedFieldCache))
            )
            .andExpect(status().isOk());

        // Validate the FieldCache in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertFieldCacheUpdatableFieldsEquals(partialUpdatedFieldCache, getPersistedFieldCache(partialUpdatedFieldCache));
    }

    @Test
    @Transactional
    void patchNonExistingFieldCache() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        fieldCache.setId(longCount.incrementAndGet());

        // Create the FieldCache
        FieldCacheDTO fieldCacheDTO = fieldCacheMapper.toDto(fieldCache);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restFieldCacheMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, fieldCacheDTO.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(fieldCacheDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the FieldCache in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithIdMismatchFieldCache() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        fieldCache.setId(longCount.incrementAndGet());

        // Create the FieldCache
        FieldCacheDTO fieldCacheDTO = fieldCacheMapper.toDto(fieldCache);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restFieldCacheMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(fieldCacheDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the FieldCache in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithMissingIdPathParamFieldCache() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        fieldCache.setId(longCount.incrementAndGet());

        // Create the FieldCache
        FieldCacheDTO fieldCacheDTO = fieldCacheMapper.toDto(fieldCache);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restFieldCacheMockMvc
            .perform(patch(ENTITY_API_URL).contentType("application/merge-patch+json").content(om.writeValueAsBytes(fieldCacheDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the FieldCache in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void deleteFieldCache() throws Exception {
        // Initialize the database
        insertedFieldCache = fieldCacheRepository.saveAndFlush(fieldCache);

        long databaseSizeBeforeDelete = getRepositoryCount();

        // Delete the fieldCache
        restFieldCacheMockMvc
            .perform(delete(ENTITY_API_URL_ID, fieldCache.getId()).accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNoContent());

        // Validate the database contains one less item
        assertDecrementedRepositoryCount(databaseSizeBeforeDelete);
    }

    protected long getRepositoryCount() {
        return fieldCacheRepository.count();
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

    protected FieldCache getPersistedFieldCache(FieldCache fieldCache) {
        return fieldCacheRepository.findById(fieldCache.getId()).orElseThrow();
    }

    protected void assertPersistedFieldCacheToMatchAllProperties(FieldCache expectedFieldCache) {
        assertFieldCacheAllPropertiesEquals(expectedFieldCache, getPersistedFieldCache(expectedFieldCache));
    }

    protected void assertPersistedFieldCacheToMatchUpdatableProperties(FieldCache expectedFieldCache) {
        assertFieldCacheAllUpdatablePropertiesEquals(expectedFieldCache, getPersistedFieldCache(expectedFieldCache));
    }
}
