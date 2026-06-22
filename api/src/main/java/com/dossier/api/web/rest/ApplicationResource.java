package com.dossier.api.web.rest;

import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ApplicationQueryService;
import com.dossier.api.service.ApplicationService;
import com.dossier.api.service.criteria.ApplicationCriteria;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.web.rest.errors.BadRequestAlertException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.HeaderUtil;
import tech.jhipster.web.util.PaginationUtil;
import tech.jhipster.web.util.ResponseUtil;

/**
 * REST controller for managing {@link com.dossier.api.domain.Application}.
 */
@RestController
@RequestMapping("/api/applications")
// SECURITY (1.11 multi-tenant leak fix): this generated entity CRUD is NOT user-scoped —
// it would let any authenticated user read or modify every user's rows. Locked to ADMIN
// until the user-scoped applications API lands (Phase 3.0).
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class ApplicationResource {

    private static final Logger LOG = LoggerFactory.getLogger(ApplicationResource.class);

    private static final String ENTITY_NAME = "application";

    @Value("${jhipster.clientApp.name}")
    private String applicationName;

    private final ApplicationService applicationService;

    private final ApplicationRepository applicationRepository;

    private final ApplicationQueryService applicationQueryService;

    public ApplicationResource(
        ApplicationService applicationService,
        ApplicationRepository applicationRepository,
        ApplicationQueryService applicationQueryService
    ) {
        this.applicationService = applicationService;
        this.applicationRepository = applicationRepository;
        this.applicationQueryService = applicationQueryService;
    }

    /**
     * {@code POST  /applications} : Create a new application.
     *
     * @param applicationDTO the applicationDTO to create.
     * @return the {@link ResponseEntity} with status {@code 201 (Created)} and with body the new applicationDTO, or with status {@code 400 (Bad Request)} if the application has already an ID.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PostMapping("")
    public ResponseEntity<ApplicationDTO> createApplication(@Valid @RequestBody ApplicationDTO applicationDTO) throws URISyntaxException {
        LOG.debug("REST request to save Application : {}", applicationDTO);
        if (applicationDTO.getId() != null) {
            throw new BadRequestAlertException("A new application cannot already have an ID", ENTITY_NAME, "idexists");
        }
        applicationDTO = applicationService.save(applicationDTO);
        return ResponseEntity.created(new URI("/api/applications/" + applicationDTO.getId()))
            .headers(HeaderUtil.createEntityCreationAlert(applicationName, false, ENTITY_NAME, applicationDTO.getId().toString()))
            .body(applicationDTO);
    }

    /**
     * {@code PUT  /applications/:id} : Updates an existing application.
     *
     * @param id the id of the applicationDTO to save.
     * @param applicationDTO the applicationDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated applicationDTO,
     * or with status {@code 400 (Bad Request)} if the applicationDTO is not valid,
     * or with status {@code 500 (Internal Server Error)} if the applicationDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PutMapping("/{id}")
    public ResponseEntity<ApplicationDTO> updateApplication(
        @PathVariable(value = "id", required = false) final Long id,
        @Valid @RequestBody ApplicationDTO applicationDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to update Application : {}, {}", id, applicationDTO);
        if (applicationDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, applicationDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!applicationRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        applicationDTO = applicationService.update(applicationDTO);
        return ResponseEntity.ok()
            .headers(HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, applicationDTO.getId().toString()))
            .body(applicationDTO);
    }

    /**
     * {@code PATCH  /applications/:id} : Partial updates given fields of an existing application, field will ignore if it is null
     *
     * @param id the id of the applicationDTO to save.
     * @param applicationDTO the applicationDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated applicationDTO,
     * or with status {@code 400 (Bad Request)} if the applicationDTO is not valid,
     * or with status {@code 404 (Not Found)} if the applicationDTO is not found,
     * or with status {@code 500 (Internal Server Error)} if the applicationDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PatchMapping(value = "/{id}", consumes = { "application/json", "application/merge-patch+json" })
    public ResponseEntity<ApplicationDTO> partialUpdateApplication(
        @PathVariable(value = "id", required = false) final Long id,
        @NotNull @RequestBody ApplicationDTO applicationDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to partial update Application partially : {}, {}", id, applicationDTO);
        if (applicationDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, applicationDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!applicationRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        Optional<ApplicationDTO> result = applicationService.partialUpdate(applicationDTO);

        return ResponseUtil.wrapOrNotFound(
            result,
            HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, applicationDTO.getId().toString())
        );
    }

    /**
     * {@code GET  /applications} : get all the applications.
     *
     * @param pageable the pagination information.
     * @param criteria the criteria which the requested entities should match.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the list of applications in body.
     */
    @GetMapping("")
    public ResponseEntity<List<ApplicationDTO>> getAllApplications(
        ApplicationCriteria criteria,
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        LOG.debug("REST request to get Applications by criteria: {}", criteria);

        Page<ApplicationDTO> page = applicationQueryService.findByCriteria(criteria, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * {@code GET  /applications/count} : count all the applications.
     *
     * @param criteria the criteria which the requested entities should match.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the count in body.
     */
    @GetMapping("/count")
    public ResponseEntity<Long> countApplications(ApplicationCriteria criteria) {
        LOG.debug("REST request to count Applications by criteria: {}", criteria);
        return ResponseEntity.ok().body(applicationQueryService.countByCriteria(criteria));
    }

    /**
     * {@code GET  /applications/:id} : get the "id" application.
     *
     * @param id the id of the applicationDTO to retrieve.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the applicationDTO, or with status {@code 404 (Not Found)}.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApplicationDTO> getApplication(@PathVariable("id") Long id) {
        LOG.debug("REST request to get Application : {}", id);
        Optional<ApplicationDTO> applicationDTO = applicationService.findOne(id);
        return ResponseUtil.wrapOrNotFound(applicationDTO);
    }

    /**
     * {@code DELETE  /applications/:id} : delete the "id" application.
     *
     * @param id the id of the applicationDTO to delete.
     * @return the {@link ResponseEntity} with status {@code 204 (NO_CONTENT)}.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteApplication(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete Application : {}", id);
        applicationService.delete(id);
        return ResponseEntity.noContent()
            .headers(HeaderUtil.createEntityDeletionAlert(applicationName, false, ENTITY_NAME, id.toString()))
            .build();
    }
}
