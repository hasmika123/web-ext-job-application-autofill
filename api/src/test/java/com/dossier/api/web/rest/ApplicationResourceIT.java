package com.dossier.api.web.rest;

import static com.dossier.api.domain.ApplicationAsserts.*;
import static com.dossier.api.web.rest.TestUtil.createUpdateProxyForBean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ApplicationService;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.mapper.ApplicationMapper;
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
 * Integration tests for the {@link ApplicationResource} REST controller.
 */
@IntegrationTest
@ExtendWith(MockitoExtension.class)
@AutoConfigureMockMvc
@WithMockUser(authorities = AuthoritiesConstants.ADMIN)
class ApplicationResourceIT {

    private static final String DEFAULT_COMPANY = "AAAAAAAAAA";
    private static final String UPDATED_COMPANY = "BBBBBBBBBB";

    private static final String DEFAULT_ROLE_TITLE = "AAAAAAAAAA";
    private static final String UPDATED_ROLE_TITLE = "BBBBBBBBBB";

    private static final String DEFAULT_JOB_URL = "AAAAAAAAAA";
    private static final String UPDATED_JOB_URL = "BBBBBBBBBB";

    private static final String DEFAULT_ATS_PLATFORM = "AAAAAAAAAA";
    private static final String UPDATED_ATS_PLATFORM = "BBBBBBBBBB";

    private static final String DEFAULT_JOB_DESCRIPTION = "AAAAAAAAAA";
    private static final String UPDATED_JOB_DESCRIPTION = "BBBBBBBBBB";

    private static final ApplicationStatus DEFAULT_STATUS = ApplicationStatus.SAVED;
    private static final ApplicationStatus UPDATED_STATUS = ApplicationStatus.APPLIED;

    private static final String DEFAULT_SOURCE = "AAAAAAAAAA";
    private static final String UPDATED_SOURCE = "BBBBBBBBBB";

    private static final Instant DEFAULT_APPLIED_AT = Instant.ofEpochMilli(0L);
    private static final Instant UPDATED_APPLIED_AT = Instant.now().truncatedTo(ChronoUnit.MILLIS);

    private static final Instant DEFAULT_CREATED_AT = Instant.ofEpochMilli(0L);
    private static final Instant UPDATED_CREATED_AT = Instant.now().truncatedTo(ChronoUnit.MILLIS);

    private static final Instant DEFAULT_UPDATED_AT = Instant.ofEpochMilli(0L);
    private static final Instant UPDATED_UPDATED_AT = Instant.now().truncatedTo(ChronoUnit.MILLIS);

    private static final String ENTITY_API_URL = "/api/applications";
    private static final String ENTITY_API_URL_ID = ENTITY_API_URL + "/{id}";

    private static Random random = new Random();
    private static AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));

    @Autowired
    private ObjectMapper om;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private UserRepository userRepository;

    @Mock
    private ApplicationRepository applicationRepositoryMock;

    @Autowired
    private ApplicationMapper applicationMapper;

    @Mock
    private ApplicationService applicationServiceMock;

    @Autowired
    private EntityManager em;

    @Autowired
    private MockMvc restApplicationMockMvc;

    private Application application;

    private Application insertedApplication;

    /**
     * Create an entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static Application createEntity() {
        return new Application()
            .company(DEFAULT_COMPANY)
            .roleTitle(DEFAULT_ROLE_TITLE)
            .jobUrl(DEFAULT_JOB_URL)
            .atsPlatform(DEFAULT_ATS_PLATFORM)
            .jobDescription(DEFAULT_JOB_DESCRIPTION)
            .status(DEFAULT_STATUS)
            .source(DEFAULT_SOURCE)
            .appliedAt(DEFAULT_APPLIED_AT)
            .createdAt(DEFAULT_CREATED_AT)
            .updatedAt(DEFAULT_UPDATED_AT);
    }

    /**
     * Create an updated entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static Application createUpdatedEntity() {
        return new Application()
            .company(UPDATED_COMPANY)
            .roleTitle(UPDATED_ROLE_TITLE)
            .jobUrl(UPDATED_JOB_URL)
            .atsPlatform(UPDATED_ATS_PLATFORM)
            .jobDescription(UPDATED_JOB_DESCRIPTION)
            .status(UPDATED_STATUS)
            .source(UPDATED_SOURCE)
            .appliedAt(UPDATED_APPLIED_AT)
            .createdAt(UPDATED_CREATED_AT)
            .updatedAt(UPDATED_UPDATED_AT);
    }

    @BeforeEach
    void initTest() {
        application = createEntity();
    }

    @AfterEach
    void cleanup() {
        if (insertedApplication != null) {
            applicationRepository.delete(insertedApplication);
            insertedApplication = null;
        }
    }

    @Test
    @Transactional
    void createApplication() throws Exception {
        long databaseSizeBeforeCreate = getRepositoryCount();
        // Create the Application
        ApplicationDTO applicationDTO = applicationMapper.toDto(application);
        var returnedApplicationDTO = om.readValue(
            restApplicationMockMvc
                .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(applicationDTO)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString(),
            ApplicationDTO.class
        );

        // Validate the Application in the database
        assertIncrementedRepositoryCount(databaseSizeBeforeCreate);
        var returnedApplication = applicationMapper.toEntity(returnedApplicationDTO);
        assertApplicationUpdatableFieldsEquals(returnedApplication, getPersistedApplication(returnedApplication));

        insertedApplication = returnedApplication;
    }

    @Test
    @Transactional
    void createApplicationWithExistingId() throws Exception {
        // Create the Application with an existing ID
        application.setId(1L);
        ApplicationDTO applicationDTO = applicationMapper.toDto(application);

        long databaseSizeBeforeCreate = getRepositoryCount();

        // An entity with an existing ID cannot be created, so this API call must fail
        restApplicationMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(applicationDTO)))
            .andExpect(status().isBadRequest());

        // Validate the Application in the database
        assertSameRepositoryCount(databaseSizeBeforeCreate);
    }

    @Test
    @Transactional
    void checkCompanyIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        application.setCompany(null);

        // Create the Application, which fails.
        ApplicationDTO applicationDTO = applicationMapper.toDto(application);

        restApplicationMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(applicationDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void checkRoleTitleIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        application.setRoleTitle(null);

        // Create the Application, which fails.
        ApplicationDTO applicationDTO = applicationMapper.toDto(application);

        restApplicationMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(applicationDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void checkStatusIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        application.setStatus(null);

        // Create the Application, which fails.
        ApplicationDTO applicationDTO = applicationMapper.toDto(application);

        restApplicationMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(applicationDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void checkCreatedAtIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        application.setCreatedAt(null);

        // Create the Application, which fails.
        ApplicationDTO applicationDTO = applicationMapper.toDto(application);

        restApplicationMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(applicationDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void checkUpdatedAtIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        application.setUpdatedAt(null);

        // Create the Application, which fails.
        ApplicationDTO applicationDTO = applicationMapper.toDto(application);

        restApplicationMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(applicationDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void getAllApplications() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList
        restApplicationMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.[*].id").value(hasItem(application.getId().intValue())))
            .andExpect(jsonPath("$.[*].company").value(hasItem(DEFAULT_COMPANY)))
            .andExpect(jsonPath("$.[*].roleTitle").value(hasItem(DEFAULT_ROLE_TITLE)))
            .andExpect(jsonPath("$.[*].jobUrl").value(hasItem(DEFAULT_JOB_URL)))
            .andExpect(jsonPath("$.[*].atsPlatform").value(hasItem(DEFAULT_ATS_PLATFORM)))
            .andExpect(jsonPath("$.[*].jobDescription").value(hasItem(DEFAULT_JOB_DESCRIPTION)))
            .andExpect(jsonPath("$.[*].status").value(hasItem(DEFAULT_STATUS.toString())))
            .andExpect(jsonPath("$.[*].source").value(hasItem(DEFAULT_SOURCE)))
            .andExpect(jsonPath("$.[*].appliedAt").value(hasItem(DEFAULT_APPLIED_AT.toString())))
            .andExpect(jsonPath("$.[*].createdAt").value(hasItem(DEFAULT_CREATED_AT.toString())))
            .andExpect(jsonPath("$.[*].updatedAt").value(hasItem(DEFAULT_UPDATED_AT.toString())));
    }

    @SuppressWarnings({ "unchecked" })
    void getAllApplicationsWithEagerRelationshipsIsEnabled() throws Exception {
        when(applicationServiceMock.findAllWithEagerRelationships(any())).thenReturn(new PageImpl(new ArrayList<>()));

        restApplicationMockMvc.perform(get(ENTITY_API_URL + "?eagerload=true")).andExpect(status().isOk());

        verify(applicationServiceMock, times(1)).findAllWithEagerRelationships(any());
    }

    @SuppressWarnings({ "unchecked" })
    void getAllApplicationsWithEagerRelationshipsIsNotEnabled() throws Exception {
        when(applicationServiceMock.findAllWithEagerRelationships(any())).thenReturn(new PageImpl(new ArrayList<>()));

        restApplicationMockMvc.perform(get(ENTITY_API_URL + "?eagerload=false")).andExpect(status().isOk());
        verify(applicationRepositoryMock, times(1)).findAll(any(Pageable.class));
    }

    @Test
    @Transactional
    void getApplication() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get the application
        restApplicationMockMvc
            .perform(get(ENTITY_API_URL_ID, application.getId()))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.id").value(application.getId().intValue()))
            .andExpect(jsonPath("$.company").value(DEFAULT_COMPANY))
            .andExpect(jsonPath("$.roleTitle").value(DEFAULT_ROLE_TITLE))
            .andExpect(jsonPath("$.jobUrl").value(DEFAULT_JOB_URL))
            .andExpect(jsonPath("$.atsPlatform").value(DEFAULT_ATS_PLATFORM))
            .andExpect(jsonPath("$.jobDescription").value(DEFAULT_JOB_DESCRIPTION))
            .andExpect(jsonPath("$.status").value(DEFAULT_STATUS.toString()))
            .andExpect(jsonPath("$.source").value(DEFAULT_SOURCE))
            .andExpect(jsonPath("$.appliedAt").value(DEFAULT_APPLIED_AT.toString()))
            .andExpect(jsonPath("$.createdAt").value(DEFAULT_CREATED_AT.toString()))
            .andExpect(jsonPath("$.updatedAt").value(DEFAULT_UPDATED_AT.toString()));
    }

    @Test
    @Transactional
    void getApplicationsByIdFiltering() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        Long id = application.getId();

        defaultApplicationFiltering("id.equals=" + id, "id.notEquals=" + id);

        defaultApplicationFiltering("id.greaterThanOrEqual=" + id, "id.greaterThan=" + id);

        defaultApplicationFiltering("id.lessThanOrEqual=" + id, "id.lessThan=" + id);
    }

    @Test
    @Transactional
    void getAllApplicationsByCompanyIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where company equals to
        defaultApplicationFiltering("company.equals=" + DEFAULT_COMPANY, "company.equals=" + UPDATED_COMPANY);
    }

    @Test
    @Transactional
    void getAllApplicationsByCompanyIsInShouldWork() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where company in
        defaultApplicationFiltering("company.in=" + DEFAULT_COMPANY + "," + UPDATED_COMPANY, "company.in=" + UPDATED_COMPANY);
    }

    @Test
    @Transactional
    void getAllApplicationsByCompanyIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where company is not null
        defaultApplicationFiltering("company.specified=true", "company.specified=false");
    }

    @Test
    @Transactional
    void getAllApplicationsByCompanyContainsSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where company contains
        defaultApplicationFiltering("company.contains=" + DEFAULT_COMPANY, "company.contains=" + UPDATED_COMPANY);
    }

    @Test
    @Transactional
    void getAllApplicationsByCompanyNotContainsSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where company does not contain
        defaultApplicationFiltering("company.doesNotContain=" + UPDATED_COMPANY, "company.doesNotContain=" + DEFAULT_COMPANY);
    }

    @Test
    @Transactional
    void getAllApplicationsByRoleTitleIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where roleTitle equals to
        defaultApplicationFiltering("roleTitle.equals=" + DEFAULT_ROLE_TITLE, "roleTitle.equals=" + UPDATED_ROLE_TITLE);
    }

    @Test
    @Transactional
    void getAllApplicationsByRoleTitleIsInShouldWork() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where roleTitle in
        defaultApplicationFiltering("roleTitle.in=" + DEFAULT_ROLE_TITLE + "," + UPDATED_ROLE_TITLE, "roleTitle.in=" + UPDATED_ROLE_TITLE);
    }

    @Test
    @Transactional
    void getAllApplicationsByRoleTitleIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where roleTitle is not null
        defaultApplicationFiltering("roleTitle.specified=true", "roleTitle.specified=false");
    }

    @Test
    @Transactional
    void getAllApplicationsByRoleTitleContainsSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where roleTitle contains
        defaultApplicationFiltering("roleTitle.contains=" + DEFAULT_ROLE_TITLE, "roleTitle.contains=" + UPDATED_ROLE_TITLE);
    }

    @Test
    @Transactional
    void getAllApplicationsByRoleTitleNotContainsSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where roleTitle does not contain
        defaultApplicationFiltering("roleTitle.doesNotContain=" + UPDATED_ROLE_TITLE, "roleTitle.doesNotContain=" + DEFAULT_ROLE_TITLE);
    }

    @Test
    @Transactional
    void getAllApplicationsByJobUrlIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where jobUrl equals to
        defaultApplicationFiltering("jobUrl.equals=" + DEFAULT_JOB_URL, "jobUrl.equals=" + UPDATED_JOB_URL);
    }

    @Test
    @Transactional
    void getAllApplicationsByJobUrlIsInShouldWork() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where jobUrl in
        defaultApplicationFiltering("jobUrl.in=" + DEFAULT_JOB_URL + "," + UPDATED_JOB_URL, "jobUrl.in=" + UPDATED_JOB_URL);
    }

    @Test
    @Transactional
    void getAllApplicationsByJobUrlIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where jobUrl is not null
        defaultApplicationFiltering("jobUrl.specified=true", "jobUrl.specified=false");
    }

    @Test
    @Transactional
    void getAllApplicationsByJobUrlContainsSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where jobUrl contains
        defaultApplicationFiltering("jobUrl.contains=" + DEFAULT_JOB_URL, "jobUrl.contains=" + UPDATED_JOB_URL);
    }

    @Test
    @Transactional
    void getAllApplicationsByJobUrlNotContainsSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where jobUrl does not contain
        defaultApplicationFiltering("jobUrl.doesNotContain=" + UPDATED_JOB_URL, "jobUrl.doesNotContain=" + DEFAULT_JOB_URL);
    }

    @Test
    @Transactional
    void getAllApplicationsByAtsPlatformIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where atsPlatform equals to
        defaultApplicationFiltering("atsPlatform.equals=" + DEFAULT_ATS_PLATFORM, "atsPlatform.equals=" + UPDATED_ATS_PLATFORM);
    }

    @Test
    @Transactional
    void getAllApplicationsByAtsPlatformIsInShouldWork() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where atsPlatform in
        defaultApplicationFiltering(
            "atsPlatform.in=" + DEFAULT_ATS_PLATFORM + "," + UPDATED_ATS_PLATFORM,
            "atsPlatform.in=" + UPDATED_ATS_PLATFORM
        );
    }

    @Test
    @Transactional
    void getAllApplicationsByAtsPlatformIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where atsPlatform is not null
        defaultApplicationFiltering("atsPlatform.specified=true", "atsPlatform.specified=false");
    }

    @Test
    @Transactional
    void getAllApplicationsByAtsPlatformContainsSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where atsPlatform contains
        defaultApplicationFiltering("atsPlatform.contains=" + DEFAULT_ATS_PLATFORM, "atsPlatform.contains=" + UPDATED_ATS_PLATFORM);
    }

    @Test
    @Transactional
    void getAllApplicationsByAtsPlatformNotContainsSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where atsPlatform does not contain
        defaultApplicationFiltering(
            "atsPlatform.doesNotContain=" + UPDATED_ATS_PLATFORM,
            "atsPlatform.doesNotContain=" + DEFAULT_ATS_PLATFORM
        );
    }

    @Test
    @Transactional
    void getAllApplicationsByStatusIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where status equals to
        defaultApplicationFiltering("status.equals=" + DEFAULT_STATUS, "status.equals=" + UPDATED_STATUS);
    }

    @Test
    @Transactional
    void getAllApplicationsByStatusIsInShouldWork() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where status in
        defaultApplicationFiltering("status.in=" + DEFAULT_STATUS + "," + UPDATED_STATUS, "status.in=" + UPDATED_STATUS);
    }

    @Test
    @Transactional
    void getAllApplicationsByStatusIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where status is not null
        defaultApplicationFiltering("status.specified=true", "status.specified=false");
    }

    @Test
    @Transactional
    void getAllApplicationsBySourceIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where source equals to
        defaultApplicationFiltering("source.equals=" + DEFAULT_SOURCE, "source.equals=" + UPDATED_SOURCE);
    }

    @Test
    @Transactional
    void getAllApplicationsBySourceIsInShouldWork() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where source in
        defaultApplicationFiltering("source.in=" + DEFAULT_SOURCE + "," + UPDATED_SOURCE, "source.in=" + UPDATED_SOURCE);
    }

    @Test
    @Transactional
    void getAllApplicationsBySourceIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where source is not null
        defaultApplicationFiltering("source.specified=true", "source.specified=false");
    }

    @Test
    @Transactional
    void getAllApplicationsBySourceContainsSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where source contains
        defaultApplicationFiltering("source.contains=" + DEFAULT_SOURCE, "source.contains=" + UPDATED_SOURCE);
    }

    @Test
    @Transactional
    void getAllApplicationsBySourceNotContainsSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where source does not contain
        defaultApplicationFiltering("source.doesNotContain=" + UPDATED_SOURCE, "source.doesNotContain=" + DEFAULT_SOURCE);
    }

    @Test
    @Transactional
    void getAllApplicationsByAppliedAtIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where appliedAt equals to
        defaultApplicationFiltering("appliedAt.equals=" + DEFAULT_APPLIED_AT, "appliedAt.equals=" + UPDATED_APPLIED_AT);
    }

    @Test
    @Transactional
    void getAllApplicationsByAppliedAtIsInShouldWork() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where appliedAt in
        defaultApplicationFiltering("appliedAt.in=" + DEFAULT_APPLIED_AT + "," + UPDATED_APPLIED_AT, "appliedAt.in=" + UPDATED_APPLIED_AT);
    }

    @Test
    @Transactional
    void getAllApplicationsByAppliedAtIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where appliedAt is not null
        defaultApplicationFiltering("appliedAt.specified=true", "appliedAt.specified=false");
    }

    @Test
    @Transactional
    void getAllApplicationsByCreatedAtIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where createdAt equals to
        defaultApplicationFiltering("createdAt.equals=" + DEFAULT_CREATED_AT, "createdAt.equals=" + UPDATED_CREATED_AT);
    }

    @Test
    @Transactional
    void getAllApplicationsByCreatedAtIsInShouldWork() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where createdAt in
        defaultApplicationFiltering("createdAt.in=" + DEFAULT_CREATED_AT + "," + UPDATED_CREATED_AT, "createdAt.in=" + UPDATED_CREATED_AT);
    }

    @Test
    @Transactional
    void getAllApplicationsByCreatedAtIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where createdAt is not null
        defaultApplicationFiltering("createdAt.specified=true", "createdAt.specified=false");
    }

    @Test
    @Transactional
    void getAllApplicationsByUpdatedAtIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where updatedAt equals to
        defaultApplicationFiltering("updatedAt.equals=" + DEFAULT_UPDATED_AT, "updatedAt.equals=" + UPDATED_UPDATED_AT);
    }

    @Test
    @Transactional
    void getAllApplicationsByUpdatedAtIsInShouldWork() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where updatedAt in
        defaultApplicationFiltering("updatedAt.in=" + DEFAULT_UPDATED_AT + "," + UPDATED_UPDATED_AT, "updatedAt.in=" + UPDATED_UPDATED_AT);
    }

    @Test
    @Transactional
    void getAllApplicationsByUpdatedAtIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        // Get all the applicationList where updatedAt is not null
        defaultApplicationFiltering("updatedAt.specified=true", "updatedAt.specified=false");
    }

    @Test
    @Transactional
    void getAllApplicationsByUserIsEqualToSomething() throws Exception {
        User user;
        if (TestUtil.findAll(em, User.class).isEmpty()) {
            applicationRepository.saveAndFlush(application);
            user = UserResourceIT.createEntity();
        } else {
            user = TestUtil.findAll(em, User.class).get(0);
        }
        em.persist(user);
        em.flush();
        application.setUser(user);
        applicationRepository.saveAndFlush(application);
        Long userId = user.getId();
        // Get all the applicationList where user equals to userId
        defaultApplicationShouldBeFound("userId.equals=" + userId);

        // Get all the applicationList where user equals to (userId + 1)
        defaultApplicationShouldNotBeFound("userId.equals=" + (userId + 1));
    }

    @Test
    @Transactional
    void getAllApplicationsByResumeIsEqualToSomething() throws Exception {
        Resume resume;
        if (TestUtil.findAll(em, Resume.class).isEmpty()) {
            applicationRepository.saveAndFlush(application);
            resume = ResumeResourceIT.createEntity();
        } else {
            resume = TestUtil.findAll(em, Resume.class).get(0);
        }
        em.persist(resume);
        em.flush();
        application.setResume(resume);
        applicationRepository.saveAndFlush(application);
        Long resumeId = resume.getId();
        // Get all the applicationList where resume equals to resumeId
        defaultApplicationShouldBeFound("resumeId.equals=" + resumeId);

        // Get all the applicationList where resume equals to (resumeId + 1)
        defaultApplicationShouldNotBeFound("resumeId.equals=" + (resumeId + 1));
    }

    private void defaultApplicationFiltering(String shouldBeFound, String shouldNotBeFound) throws Exception {
        defaultApplicationShouldBeFound(shouldBeFound);
        defaultApplicationShouldNotBeFound(shouldNotBeFound);
    }

    /**
     * Executes the search, and checks that the default entity is returned.
     */
    private void defaultApplicationShouldBeFound(String filter) throws Exception {
        restApplicationMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.[*].id").value(hasItem(application.getId().intValue())))
            .andExpect(jsonPath("$.[*].company").value(hasItem(DEFAULT_COMPANY)))
            .andExpect(jsonPath("$.[*].roleTitle").value(hasItem(DEFAULT_ROLE_TITLE)))
            .andExpect(jsonPath("$.[*].jobUrl").value(hasItem(DEFAULT_JOB_URL)))
            .andExpect(jsonPath("$.[*].atsPlatform").value(hasItem(DEFAULT_ATS_PLATFORM)))
            .andExpect(jsonPath("$.[*].jobDescription").value(hasItem(DEFAULT_JOB_DESCRIPTION)))
            .andExpect(jsonPath("$.[*].status").value(hasItem(DEFAULT_STATUS.toString())))
            .andExpect(jsonPath("$.[*].source").value(hasItem(DEFAULT_SOURCE)))
            .andExpect(jsonPath("$.[*].appliedAt").value(hasItem(DEFAULT_APPLIED_AT.toString())))
            .andExpect(jsonPath("$.[*].createdAt").value(hasItem(DEFAULT_CREATED_AT.toString())))
            .andExpect(jsonPath("$.[*].updatedAt").value(hasItem(DEFAULT_UPDATED_AT.toString())));

        // Check, that the count call also returns 1
        restApplicationMockMvc
            .perform(get(ENTITY_API_URL + "/count?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(content().string("1"));
    }

    /**
     * Executes the search, and checks that the default entity is not returned.
     */
    private void defaultApplicationShouldNotBeFound(String filter) throws Exception {
        restApplicationMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$").isArray())
            .andExpect(jsonPath("$").isEmpty());

        // Check, that the count call also returns 0
        restApplicationMockMvc
            .perform(get(ENTITY_API_URL + "/count?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(content().string("0"));
    }

    @Test
    @Transactional
    void getNonExistingApplication() throws Exception {
        // Get the application
        restApplicationMockMvc.perform(get(ENTITY_API_URL_ID, Long.MAX_VALUE)).andExpect(status().isNotFound());
    }

    @Test
    @Transactional
    void putExistingApplication() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the application
        Application updatedApplication = applicationRepository.findById(application.getId()).orElseThrow();
        // Disconnect from session so that the updates on updatedApplication are not directly saved in db
        em.detach(updatedApplication);
        updatedApplication
            .company(UPDATED_COMPANY)
            .roleTitle(UPDATED_ROLE_TITLE)
            .jobUrl(UPDATED_JOB_URL)
            .atsPlatform(UPDATED_ATS_PLATFORM)
            .jobDescription(UPDATED_JOB_DESCRIPTION)
            .status(UPDATED_STATUS)
            .source(UPDATED_SOURCE)
            .appliedAt(UPDATED_APPLIED_AT)
            .createdAt(UPDATED_CREATED_AT)
            .updatedAt(UPDATED_UPDATED_AT);
        ApplicationDTO applicationDTO = applicationMapper.toDto(updatedApplication);

        restApplicationMockMvc
            .perform(
                put(ENTITY_API_URL_ID, applicationDTO.getId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(applicationDTO))
            )
            .andExpect(status().isOk());

        // Validate the Application in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertPersistedApplicationToMatchAllProperties(updatedApplication);
    }

    @Test
    @Transactional
    void putNonExistingApplication() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        application.setId(longCount.incrementAndGet());

        // Create the Application
        ApplicationDTO applicationDTO = applicationMapper.toDto(application);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restApplicationMockMvc
            .perform(
                put(ENTITY_API_URL_ID, applicationDTO.getId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(applicationDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Application in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithIdMismatchApplication() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        application.setId(longCount.incrementAndGet());

        // Create the Application
        ApplicationDTO applicationDTO = applicationMapper.toDto(application);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restApplicationMockMvc
            .perform(
                put(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(applicationDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Application in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithMissingIdPathParamApplication() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        application.setId(longCount.incrementAndGet());

        // Create the Application
        ApplicationDTO applicationDTO = applicationMapper.toDto(application);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restApplicationMockMvc
            .perform(put(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(applicationDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the Application in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void partialUpdateApplicationWithPatch() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the application using partial update
        Application partialUpdatedApplication = new Application();
        partialUpdatedApplication.setId(application.getId());

        partialUpdatedApplication.company(UPDATED_COMPANY).jobDescription(UPDATED_JOB_DESCRIPTION).updatedAt(UPDATED_UPDATED_AT);

        restApplicationMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedApplication.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedApplication))
            )
            .andExpect(status().isOk());

        // Validate the Application in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertApplicationUpdatableFieldsEquals(
            createUpdateProxyForBean(partialUpdatedApplication, application),
            getPersistedApplication(application)
        );
    }

    @Test
    @Transactional
    void fullUpdateApplicationWithPatch() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the application using partial update
        Application partialUpdatedApplication = new Application();
        partialUpdatedApplication.setId(application.getId());

        partialUpdatedApplication
            .company(UPDATED_COMPANY)
            .roleTitle(UPDATED_ROLE_TITLE)
            .jobUrl(UPDATED_JOB_URL)
            .atsPlatform(UPDATED_ATS_PLATFORM)
            .jobDescription(UPDATED_JOB_DESCRIPTION)
            .status(UPDATED_STATUS)
            .source(UPDATED_SOURCE)
            .appliedAt(UPDATED_APPLIED_AT)
            .createdAt(UPDATED_CREATED_AT)
            .updatedAt(UPDATED_UPDATED_AT);

        restApplicationMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedApplication.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedApplication))
            )
            .andExpect(status().isOk());

        // Validate the Application in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertApplicationUpdatableFieldsEquals(partialUpdatedApplication, getPersistedApplication(partialUpdatedApplication));
    }

    @Test
    @Transactional
    void patchNonExistingApplication() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        application.setId(longCount.incrementAndGet());

        // Create the Application
        ApplicationDTO applicationDTO = applicationMapper.toDto(application);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restApplicationMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, applicationDTO.getId())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(applicationDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Application in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithIdMismatchApplication() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        application.setId(longCount.incrementAndGet());

        // Create the Application
        ApplicationDTO applicationDTO = applicationMapper.toDto(application);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restApplicationMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(applicationDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Application in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithMissingIdPathParamApplication() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        application.setId(longCount.incrementAndGet());

        // Create the Application
        ApplicationDTO applicationDTO = applicationMapper.toDto(application);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restApplicationMockMvc
            .perform(patch(ENTITY_API_URL).contentType("application/merge-patch+json").content(om.writeValueAsBytes(applicationDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the Application in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void deleteApplication() throws Exception {
        // Initialize the database
        insertedApplication = applicationRepository.saveAndFlush(application);

        long databaseSizeBeforeDelete = getRepositoryCount();

        // Delete the application
        restApplicationMockMvc
            .perform(delete(ENTITY_API_URL_ID, application.getId()).accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNoContent());

        // Validate the database contains one less item
        assertDecrementedRepositoryCount(databaseSizeBeforeDelete);
    }

    protected long getRepositoryCount() {
        return applicationRepository.count();
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

    protected Application getPersistedApplication(Application application) {
        return applicationRepository.findById(application.getId()).orElseThrow();
    }

    protected void assertPersistedApplicationToMatchAllProperties(Application expectedApplication) {
        assertApplicationAllPropertiesEquals(expectedApplication, getPersistedApplication(expectedApplication));
    }

    protected void assertPersistedApplicationToMatchUpdatableProperties(Application expectedApplication) {
        assertApplicationAllUpdatablePropertiesEquals(expectedApplication, getPersistedApplication(expectedApplication));
    }
}
