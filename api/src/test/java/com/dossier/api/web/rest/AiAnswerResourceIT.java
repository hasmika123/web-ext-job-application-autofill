package com.dossier.api.web.rest;

import static com.dossier.api.domain.AiAnswerAsserts.*;
import static com.dossier.api.web.rest.TestUtil.createUpdateProxyForBean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AiAnswer;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.AiAnswerService;
import com.dossier.api.service.dto.AiAnswerDTO;
import com.dossier.api.service.mapper.AiAnswerMapper;
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
 * Integration tests for the {@link AiAnswerResource} REST controller.
 */
@IntegrationTest
@ExtendWith(MockitoExtension.class)
@AutoConfigureMockMvc
@WithMockUser
class AiAnswerResourceIT {

    private static final String DEFAULT_QUESTION_HASH = "AAAAAAAAAA";
    private static final String UPDATED_QUESTION_HASH = "BBBBBBBBBB";

    private static final String DEFAULT_ANSWER = "AAAAAAAAAA";
    private static final String UPDATED_ANSWER = "BBBBBBBBBB";

    private static final String DEFAULT_MODEL = "AAAAAAAAAA";
    private static final String UPDATED_MODEL = "BBBBBBBBBB";

    private static final Integer DEFAULT_TOKENS = 1;
    private static final Integer UPDATED_TOKENS = 2;

    private static final Instant DEFAULT_CREATED_AT = Instant.ofEpochMilli(0L);
    private static final Instant UPDATED_CREATED_AT = Instant.now().truncatedTo(ChronoUnit.MILLIS);

    private static final String ENTITY_API_URL = "/api/ai-answers";
    private static final String ENTITY_API_URL_ID = ENTITY_API_URL + "/{id}";

    private static Random random = new Random();
    private static AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));

    @Autowired
    private ObjectMapper om;

    @Autowired
    private AiAnswerRepository aiAnswerRepository;

    @Autowired
    private UserRepository userRepository;

    @Mock
    private AiAnswerRepository aiAnswerRepositoryMock;

    @Autowired
    private AiAnswerMapper aiAnswerMapper;

    @Mock
    private AiAnswerService aiAnswerServiceMock;

    @Autowired
    private EntityManager em;

    @Autowired
    private MockMvc restAiAnswerMockMvc;

    private AiAnswer aiAnswer;

    private AiAnswer insertedAiAnswer;

    /**
     * Create an entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static AiAnswer createEntity() {
        return new AiAnswer()
            .questionHash(DEFAULT_QUESTION_HASH)
            .answer(DEFAULT_ANSWER)
            .model(DEFAULT_MODEL)
            .tokens(DEFAULT_TOKENS)
            .createdAt(DEFAULT_CREATED_AT);
    }

    /**
     * Create an updated entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static AiAnswer createUpdatedEntity() {
        return new AiAnswer()
            .questionHash(UPDATED_QUESTION_HASH)
            .answer(UPDATED_ANSWER)
            .model(UPDATED_MODEL)
            .tokens(UPDATED_TOKENS)
            .createdAt(UPDATED_CREATED_AT);
    }

    @BeforeEach
    void initTest() {
        aiAnswer = createEntity();
    }

    @AfterEach
    void cleanup() {
        if (insertedAiAnswer != null) {
            aiAnswerRepository.delete(insertedAiAnswer);
            insertedAiAnswer = null;
        }
    }

    @Test
    @Transactional
    void createAiAnswer() throws Exception {
        long databaseSizeBeforeCreate = getRepositoryCount();
        // Create the AiAnswer
        AiAnswerDTO aiAnswerDTO = aiAnswerMapper.toDto(aiAnswer);
        var returnedAiAnswerDTO = om.readValue(
            restAiAnswerMockMvc
                .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(aiAnswerDTO)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString(),
            AiAnswerDTO.class
        );

        // Validate the AiAnswer in the database
        assertIncrementedRepositoryCount(databaseSizeBeforeCreate);
        var returnedAiAnswer = aiAnswerMapper.toEntity(returnedAiAnswerDTO);
        assertAiAnswerUpdatableFieldsEquals(returnedAiAnswer, getPersistedAiAnswer(returnedAiAnswer));

        insertedAiAnswer = returnedAiAnswer;
    }

    @Test
    @Transactional
    void createAiAnswerWithExistingId() throws Exception {
        // Create the AiAnswer with an existing ID
        aiAnswer.setId(1L);
        AiAnswerDTO aiAnswerDTO = aiAnswerMapper.toDto(aiAnswer);

        long databaseSizeBeforeCreate = getRepositoryCount();

        // An entity with an existing ID cannot be created, so this API call must fail
        restAiAnswerMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(aiAnswerDTO)))
            .andExpect(status().isBadRequest());

        // Validate the AiAnswer in the database
        assertSameRepositoryCount(databaseSizeBeforeCreate);
    }

    @Test
    @Transactional
    void checkQuestionHashIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        aiAnswer.setQuestionHash(null);

        // Create the AiAnswer, which fails.
        AiAnswerDTO aiAnswerDTO = aiAnswerMapper.toDto(aiAnswer);

        restAiAnswerMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(aiAnswerDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void checkCreatedAtIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        aiAnswer.setCreatedAt(null);

        // Create the AiAnswer, which fails.
        AiAnswerDTO aiAnswerDTO = aiAnswerMapper.toDto(aiAnswer);

        restAiAnswerMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(aiAnswerDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void getAllAiAnswers() throws Exception {
        // Initialize the database
        insertedAiAnswer = aiAnswerRepository.saveAndFlush(aiAnswer);

        // Get all the aiAnswerList
        restAiAnswerMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.[*].id").value(hasItem(aiAnswer.getId().intValue())))
            .andExpect(jsonPath("$.[*].questionHash").value(hasItem(DEFAULT_QUESTION_HASH)))
            .andExpect(jsonPath("$.[*].answer").value(hasItem(DEFAULT_ANSWER)))
            .andExpect(jsonPath("$.[*].model").value(hasItem(DEFAULT_MODEL)))
            .andExpect(jsonPath("$.[*].tokens").value(hasItem(DEFAULT_TOKENS)))
            .andExpect(jsonPath("$.[*].createdAt").value(hasItem(DEFAULT_CREATED_AT.toString())));
    }

    @SuppressWarnings({ "unchecked" })
    void getAllAiAnswersWithEagerRelationshipsIsEnabled() throws Exception {
        when(aiAnswerServiceMock.findAllWithEagerRelationships(any())).thenReturn(new PageImpl(new ArrayList<>()));

        restAiAnswerMockMvc.perform(get(ENTITY_API_URL + "?eagerload=true")).andExpect(status().isOk());

        verify(aiAnswerServiceMock, times(1)).findAllWithEagerRelationships(any());
    }

    @SuppressWarnings({ "unchecked" })
    void getAllAiAnswersWithEagerRelationshipsIsNotEnabled() throws Exception {
        when(aiAnswerServiceMock.findAllWithEagerRelationships(any())).thenReturn(new PageImpl(new ArrayList<>()));

        restAiAnswerMockMvc.perform(get(ENTITY_API_URL + "?eagerload=false")).andExpect(status().isOk());
        verify(aiAnswerRepositoryMock, times(1)).findAll(any(Pageable.class));
    }

    @Test
    @Transactional
    void getAiAnswer() throws Exception {
        // Initialize the database
        insertedAiAnswer = aiAnswerRepository.saveAndFlush(aiAnswer);

        // Get the aiAnswer
        restAiAnswerMockMvc
            .perform(get(ENTITY_API_URL_ID, aiAnswer.getId()))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.id").value(aiAnswer.getId().intValue()))
            .andExpect(jsonPath("$.questionHash").value(DEFAULT_QUESTION_HASH))
            .andExpect(jsonPath("$.answer").value(DEFAULT_ANSWER))
            .andExpect(jsonPath("$.model").value(DEFAULT_MODEL))
            .andExpect(jsonPath("$.tokens").value(DEFAULT_TOKENS))
            .andExpect(jsonPath("$.createdAt").value(DEFAULT_CREATED_AT.toString()));
    }

    @Test
    @Transactional
    void getNonExistingAiAnswer() throws Exception {
        // Get the aiAnswer
        restAiAnswerMockMvc.perform(get(ENTITY_API_URL_ID, Long.MAX_VALUE)).andExpect(status().isNotFound());
    }

    @Test
    @Transactional
    void putExistingAiAnswer() throws Exception {
        // Initialize the database
        insertedAiAnswer = aiAnswerRepository.saveAndFlush(aiAnswer);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the aiAnswer
        AiAnswer updatedAiAnswer = aiAnswerRepository.findById(aiAnswer.getId()).orElseThrow();
        // Disconnect from session so that the updates on updatedAiAnswer are not directly saved in db
        em.detach(updatedAiAnswer);
        updatedAiAnswer
            .questionHash(UPDATED_QUESTION_HASH)
            .answer(UPDATED_ANSWER)
            .model(UPDATED_MODEL)
            .tokens(UPDATED_TOKENS)
            .createdAt(UPDATED_CREATED_AT);
        AiAnswerDTO aiAnswerDTO = aiAnswerMapper.toDto(updatedAiAnswer);

        restAiAnswerMockMvc
            .perform(
                put(ENTITY_API_URL_ID, aiAnswerDTO.getId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(aiAnswerDTO))
            )
            .andExpect(status().isOk());

        // Validate the AiAnswer in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertPersistedAiAnswerToMatchAllProperties(updatedAiAnswer);
    }

    @Test
    @Transactional
    void putNonExistingAiAnswer() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        aiAnswer.setId(longCount.incrementAndGet());

        // Create the AiAnswer
        AiAnswerDTO aiAnswerDTO = aiAnswerMapper.toDto(aiAnswer);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restAiAnswerMockMvc
            .perform(
                put(ENTITY_API_URL_ID, aiAnswerDTO.getId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(aiAnswerDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the AiAnswer in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithIdMismatchAiAnswer() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        aiAnswer.setId(longCount.incrementAndGet());

        // Create the AiAnswer
        AiAnswerDTO aiAnswerDTO = aiAnswerMapper.toDto(aiAnswer);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restAiAnswerMockMvc
            .perform(
                put(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(aiAnswerDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the AiAnswer in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithMissingIdPathParamAiAnswer() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        aiAnswer.setId(longCount.incrementAndGet());

        // Create the AiAnswer
        AiAnswerDTO aiAnswerDTO = aiAnswerMapper.toDto(aiAnswer);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restAiAnswerMockMvc
            .perform(put(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(aiAnswerDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the AiAnswer in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void partialUpdateAiAnswerWithPatch() throws Exception {
        // Initialize the database
        insertedAiAnswer = aiAnswerRepository.saveAndFlush(aiAnswer);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the aiAnswer using partial update
        AiAnswer partialUpdatedAiAnswer = new AiAnswer();
        partialUpdatedAiAnswer.setId(aiAnswer.getId());

        partialUpdatedAiAnswer.tokens(UPDATED_TOKENS).createdAt(UPDATED_CREATED_AT);

        restAiAnswerMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedAiAnswer.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedAiAnswer))
            )
            .andExpect(status().isOk());

        // Validate the AiAnswer in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertAiAnswerUpdatableFieldsEquals(createUpdateProxyForBean(partialUpdatedAiAnswer, aiAnswer), getPersistedAiAnswer(aiAnswer));
    }

    @Test
    @Transactional
    void fullUpdateAiAnswerWithPatch() throws Exception {
        // Initialize the database
        insertedAiAnswer = aiAnswerRepository.saveAndFlush(aiAnswer);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the aiAnswer using partial update
        AiAnswer partialUpdatedAiAnswer = new AiAnswer();
        partialUpdatedAiAnswer.setId(aiAnswer.getId());

        partialUpdatedAiAnswer
            .questionHash(UPDATED_QUESTION_HASH)
            .answer(UPDATED_ANSWER)
            .model(UPDATED_MODEL)
            .tokens(UPDATED_TOKENS)
            .createdAt(UPDATED_CREATED_AT);

        restAiAnswerMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedAiAnswer.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedAiAnswer))
            )
            .andExpect(status().isOk());

        // Validate the AiAnswer in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertAiAnswerUpdatableFieldsEquals(partialUpdatedAiAnswer, getPersistedAiAnswer(partialUpdatedAiAnswer));
    }

    @Test
    @Transactional
    void patchNonExistingAiAnswer() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        aiAnswer.setId(longCount.incrementAndGet());

        // Create the AiAnswer
        AiAnswerDTO aiAnswerDTO = aiAnswerMapper.toDto(aiAnswer);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restAiAnswerMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, aiAnswerDTO.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(aiAnswerDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the AiAnswer in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithIdMismatchAiAnswer() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        aiAnswer.setId(longCount.incrementAndGet());

        // Create the AiAnswer
        AiAnswerDTO aiAnswerDTO = aiAnswerMapper.toDto(aiAnswer);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restAiAnswerMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(aiAnswerDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the AiAnswer in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithMissingIdPathParamAiAnswer() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        aiAnswer.setId(longCount.incrementAndGet());

        // Create the AiAnswer
        AiAnswerDTO aiAnswerDTO = aiAnswerMapper.toDto(aiAnswer);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restAiAnswerMockMvc
            .perform(patch(ENTITY_API_URL).contentType("application/merge-patch+json").content(om.writeValueAsBytes(aiAnswerDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the AiAnswer in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void deleteAiAnswer() throws Exception {
        // Initialize the database
        insertedAiAnswer = aiAnswerRepository.saveAndFlush(aiAnswer);

        long databaseSizeBeforeDelete = getRepositoryCount();

        // Delete the aiAnswer
        restAiAnswerMockMvc
            .perform(delete(ENTITY_API_URL_ID, aiAnswer.getId()).accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNoContent());

        // Validate the database contains one less item
        assertDecrementedRepositoryCount(databaseSizeBeforeDelete);
    }

    protected long getRepositoryCount() {
        return aiAnswerRepository.count();
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

    protected AiAnswer getPersistedAiAnswer(AiAnswer aiAnswer) {
        return aiAnswerRepository.findById(aiAnswer.getId()).orElseThrow();
    }

    protected void assertPersistedAiAnswerToMatchAllProperties(AiAnswer expectedAiAnswer) {
        assertAiAnswerAllPropertiesEquals(expectedAiAnswer, getPersistedAiAnswer(expectedAiAnswer));
    }

    protected void assertPersistedAiAnswerToMatchUpdatableProperties(AiAnswer expectedAiAnswer) {
        assertAiAnswerAllUpdatablePropertiesEquals(expectedAiAnswer, getPersistedAiAnswer(expectedAiAnswer));
    }
}
