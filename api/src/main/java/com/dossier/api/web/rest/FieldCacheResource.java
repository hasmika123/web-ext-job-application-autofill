package com.dossier.api.web.rest;

import com.dossier.api.repository.FieldCacheRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.FieldCacheService;
import com.dossier.api.service.dto.FieldCacheDTO;
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
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tech.jhipster.web.util.HeaderUtil;
import tech.jhipster.web.util.ResponseUtil;

/**
 * REST controller for managing {@link com.dossier.api.domain.FieldCache}.
 */
@RestController
@RequestMapping("/api/field-caches")
// SECURITY (1.11 multi-tenant leak fix): this generated entity CRUD is NOT user-scoped —
// it would let any authenticated user read or modify every user's rows. Locked to ADMIN
// until the cloud field-cache API lands (Phase 4.1).
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class FieldCacheResource {

    private static final Logger LOG = LoggerFactory.getLogger(FieldCacheResource.class);

    private static final String ENTITY_NAME = "fieldCache";

    @Value("${jhipster.clientApp.name}")
    private String applicationName;

    private final FieldCacheService fieldCacheService;

    private final FieldCacheRepository fieldCacheRepository;

    public FieldCacheResource(FieldCacheService fieldCacheService, FieldCacheRepository fieldCacheRepository) {
        this.fieldCacheService = fieldCacheService;
        this.fieldCacheRepository = fieldCacheRepository;
    }

    /**
     * {@code POST  /field-caches} : Create a new fieldCache.
     *
     * @param fieldCacheDTO the fieldCacheDTO to create.
     * @return the {@link ResponseEntity} with status {@code 201 (Created)} and with body the new fieldCacheDTO, or with status {@code 400 (Bad Request)} if the fieldCache has already an ID.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PostMapping("")
    public ResponseEntity<FieldCacheDTO> createFieldCache(@Valid @RequestBody FieldCacheDTO fieldCacheDTO) throws URISyntaxException {
        LOG.debug("REST request to save FieldCache : {}", fieldCacheDTO);
        if (fieldCacheDTO.getId() != null) {
            throw new BadRequestAlertException("A new fieldCache cannot already have an ID", ENTITY_NAME, "idexists");
        }
        fieldCacheDTO = fieldCacheService.save(fieldCacheDTO);
        return ResponseEntity.created(new URI("/api/field-caches/" + fieldCacheDTO.getId()))
            .headers(HeaderUtil.createEntityCreationAlert(applicationName, false, ENTITY_NAME, fieldCacheDTO.getId().toString()))
            .body(fieldCacheDTO);
    }

    /**
     * {@code PUT  /field-caches/:id} : Updates an existing fieldCache.
     *
     * @param id the id of the fieldCacheDTO to save.
     * @param fieldCacheDTO the fieldCacheDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated fieldCacheDTO,
     * or with status {@code 400 (Bad Request)} if the fieldCacheDTO is not valid,
     * or with status {@code 500 (Internal Server Error)} if the fieldCacheDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PutMapping("/{id}")
    public ResponseEntity<FieldCacheDTO> updateFieldCache(
        @PathVariable(value = "id", required = false) final Long id,
        @Valid @RequestBody FieldCacheDTO fieldCacheDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to update FieldCache : {}, {}", id, fieldCacheDTO);
        if (fieldCacheDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, fieldCacheDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!fieldCacheRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        fieldCacheDTO = fieldCacheService.update(fieldCacheDTO);
        return ResponseEntity.ok()
            .headers(HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, fieldCacheDTO.getId().toString()))
            .body(fieldCacheDTO);
    }

    /**
     * {@code PATCH  /field-caches/:id} : Partial updates given fields of an existing fieldCache, field will ignore if it is null
     *
     * @param id the id of the fieldCacheDTO to save.
     * @param fieldCacheDTO the fieldCacheDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated fieldCacheDTO,
     * or with status {@code 400 (Bad Request)} if the fieldCacheDTO is not valid,
     * or with status {@code 404 (Not Found)} if the fieldCacheDTO is not found,
     * or with status {@code 500 (Internal Server Error)} if the fieldCacheDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PatchMapping(value = "/{id}", consumes = { "application/json", "application/merge-patch+json" })
    public ResponseEntity<FieldCacheDTO> partialUpdateFieldCache(
        @PathVariable(value = "id", required = false) final Long id,
        @NotNull @RequestBody FieldCacheDTO fieldCacheDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to partial update FieldCache partially : {}, {}", id, fieldCacheDTO);
        if (fieldCacheDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, fieldCacheDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!fieldCacheRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        Optional<FieldCacheDTO> result = fieldCacheService.partialUpdate(fieldCacheDTO);

        return ResponseUtil.wrapOrNotFound(
            result,
            HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, fieldCacheDTO.getId().toString())
        );
    }

    /**
     * {@code GET  /field-caches} : get all the fieldCaches.
     *
     * @param eagerload flag to eager load entities from relationships (This is applicable for many-to-many).
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the list of fieldCaches in body.
     */
    @GetMapping("")
    public List<FieldCacheDTO> getAllFieldCaches(
        @RequestParam(name = "eagerload", required = false, defaultValue = "true") boolean eagerload
    ) {
        LOG.debug("REST request to get all FieldCaches");
        return fieldCacheService.findAll();
    }

    /**
     * {@code GET  /field-caches/:id} : get the "id" fieldCache.
     *
     * @param id the id of the fieldCacheDTO to retrieve.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the fieldCacheDTO, or with status {@code 404 (Not Found)}.
     */
    @GetMapping("/{id}")
    public ResponseEntity<FieldCacheDTO> getFieldCache(@PathVariable("id") Long id) {
        LOG.debug("REST request to get FieldCache : {}", id);
        Optional<FieldCacheDTO> fieldCacheDTO = fieldCacheService.findOne(id);
        return ResponseUtil.wrapOrNotFound(fieldCacheDTO);
    }

    /**
     * {@code DELETE  /field-caches/:id} : delete the "id" fieldCache.
     *
     * @param id the id of the fieldCacheDTO to delete.
     * @return the {@link ResponseEntity} with status {@code 204 (NO_CONTENT)}.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteFieldCache(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete FieldCache : {}", id);
        fieldCacheService.delete(id);
        return ResponseEntity.noContent()
            .headers(HeaderUtil.createEntityDeletionAlert(applicationName, false, ENTITY_NAME, id.toString()))
            .build();
    }
}
