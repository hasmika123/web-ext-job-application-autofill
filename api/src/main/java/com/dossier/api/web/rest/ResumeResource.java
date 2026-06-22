package com.dossier.api.web.rest;

import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ResumeService;
import com.dossier.api.service.dto.ResumeDTO;
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
 * REST controller for managing {@link com.dossier.api.domain.Resume}.
 */
@RestController
@RequestMapping("/api/resumes")
// SECURITY (1.11 multi-tenant leak fix): this generated entity CRUD is NOT user-scoped —
// it would let any authenticated user read or modify every user's rows. The product's
// real surface is the user-scoped /api/profile/resumes API (and the owner-scoped
// ResumeFileResource at /api/resumes/{id}/file, a separate class); this raw CRUD is
// locked to ADMIN.
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class ResumeResource {

    private static final Logger LOG = LoggerFactory.getLogger(ResumeResource.class);

    private static final String ENTITY_NAME = "resume";

    @Value("${jhipster.clientApp.name}")
    private String applicationName;

    private final ResumeService resumeService;

    private final ResumeRepository resumeRepository;

    public ResumeResource(ResumeService resumeService, ResumeRepository resumeRepository) {
        this.resumeService = resumeService;
        this.resumeRepository = resumeRepository;
    }

    /**
     * {@code POST  /resumes} : Create a new resume.
     *
     * @param resumeDTO the resumeDTO to create.
     * @return the {@link ResponseEntity} with status {@code 201 (Created)} and with body the new resumeDTO, or with status {@code 400 (Bad Request)} if the resume has already an ID.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PostMapping("")
    public ResponseEntity<ResumeDTO> createResume(@Valid @RequestBody ResumeDTO resumeDTO) throws URISyntaxException {
        LOG.debug("REST request to save Resume : {}", resumeDTO);
        if (resumeDTO.getId() != null) {
            throw new BadRequestAlertException("A new resume cannot already have an ID", ENTITY_NAME, "idexists");
        }
        resumeDTO = resumeService.save(resumeDTO);
        return ResponseEntity.created(new URI("/api/resumes/" + resumeDTO.getId()))
            .headers(HeaderUtil.createEntityCreationAlert(applicationName, false, ENTITY_NAME, resumeDTO.getId().toString()))
            .body(resumeDTO);
    }

    /**
     * {@code PUT  /resumes/:id} : Updates an existing resume.
     *
     * @param id the id of the resumeDTO to save.
     * @param resumeDTO the resumeDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated resumeDTO,
     * or with status {@code 400 (Bad Request)} if the resumeDTO is not valid,
     * or with status {@code 500 (Internal Server Error)} if the resumeDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PutMapping("/{id}")
    public ResponseEntity<ResumeDTO> updateResume(
        @PathVariable(value = "id", required = false) final Long id,
        @Valid @RequestBody ResumeDTO resumeDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to update Resume : {}, {}", id, resumeDTO);
        if (resumeDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, resumeDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!resumeRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        resumeDTO = resumeService.update(resumeDTO);
        return ResponseEntity.ok()
            .headers(HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, resumeDTO.getId().toString()))
            .body(resumeDTO);
    }

    /**
     * {@code PATCH  /resumes/:id} : Partial updates given fields of an existing resume, field will ignore if it is null
     *
     * @param id the id of the resumeDTO to save.
     * @param resumeDTO the resumeDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated resumeDTO,
     * or with status {@code 400 (Bad Request)} if the resumeDTO is not valid,
     * or with status {@code 404 (Not Found)} if the resumeDTO is not found,
     * or with status {@code 500 (Internal Server Error)} if the resumeDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PatchMapping(value = "/{id}", consumes = { "application/json", "application/merge-patch+json" })
    public ResponseEntity<ResumeDTO> partialUpdateResume(
        @PathVariable(value = "id", required = false) final Long id,
        @NotNull @RequestBody ResumeDTO resumeDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to partial update Resume partially : {}, {}", id, resumeDTO);
        if (resumeDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, resumeDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!resumeRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        Optional<ResumeDTO> result = resumeService.partialUpdate(resumeDTO);

        return ResponseUtil.wrapOrNotFound(
            result,
            HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, resumeDTO.getId().toString())
        );
    }

    /**
     * {@code GET  /resumes} : get all the resumes.
     *
     * @param pageable the pagination information.
     * @param eagerload flag to eager load entities from relationships (This is applicable for many-to-many).
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the list of resumes in body.
     */
    @GetMapping("")
    public ResponseEntity<List<ResumeDTO>> getAllResumes(
        @org.springdoc.core.annotations.ParameterObject Pageable pageable,
        @RequestParam(name = "eagerload", required = false, defaultValue = "true") boolean eagerload
    ) {
        LOG.debug("REST request to get a page of Resumes");
        Page<ResumeDTO> page;
        if (eagerload) {
            page = resumeService.findAllWithEagerRelationships(pageable);
        } else {
            page = resumeService.findAll(pageable);
        }
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * {@code GET  /resumes/:id} : get the "id" resume.
     *
     * @param id the id of the resumeDTO to retrieve.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the resumeDTO, or with status {@code 404 (Not Found)}.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ResumeDTO> getResume(@PathVariable("id") Long id) {
        LOG.debug("REST request to get Resume : {}", id);
        Optional<ResumeDTO> resumeDTO = resumeService.findOne(id);
        return ResponseUtil.wrapOrNotFound(resumeDTO);
    }

    /**
     * {@code DELETE  /resumes/:id} : delete the "id" resume.
     *
     * @param id the id of the resumeDTO to delete.
     * @return the {@link ResponseEntity} with status {@code 204 (NO_CONTENT)}.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteResume(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete Resume : {}", id);
        resumeService.delete(id);
        return ResponseEntity.noContent()
            .headers(HeaderUtil.createEntityDeletionAlert(applicationName, false, ENTITY_NAME, id.toString()))
            .build();
    }
}
