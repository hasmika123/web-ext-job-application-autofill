package com.dossier.api.web.rest;

import com.dossier.api.repository.BioRepository;
import com.dossier.api.service.BioService;
import com.dossier.api.service.dto.BioDTO;
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
import org.springframework.web.bind.annotation.*;
import tech.jhipster.web.util.HeaderUtil;
import tech.jhipster.web.util.ResponseUtil;

/**
 * REST controller for managing {@link com.dossier.api.domain.Bio}.
 */
@RestController
@RequestMapping("/api/bios")
public class BioResource {

    private static final Logger LOG = LoggerFactory.getLogger(BioResource.class);

    private static final String ENTITY_NAME = "bio";

    @Value("${jhipster.clientApp.name}")
    private String applicationName;

    private final BioService bioService;

    private final BioRepository bioRepository;

    public BioResource(BioService bioService, BioRepository bioRepository) {
        this.bioService = bioService;
        this.bioRepository = bioRepository;
    }

    /**
     * {@code POST  /bios} : Create a new bio.
     *
     * @param bioDTO the bioDTO to create.
     * @return the {@link ResponseEntity} with status {@code 201 (Created)} and with body the new bioDTO, or with status {@code 400 (Bad Request)} if the bio has already an ID.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PostMapping("")
    public ResponseEntity<BioDTO> createBio(@Valid @RequestBody BioDTO bioDTO) throws URISyntaxException {
        LOG.debug("REST request to save Bio : {}", bioDTO);
        if (bioDTO.getId() != null) {
            throw new BadRequestAlertException("A new bio cannot already have an ID", ENTITY_NAME, "idexists");
        }
        bioDTO = bioService.save(bioDTO);
        return ResponseEntity.created(new URI("/api/bios/" + bioDTO.getId()))
            .headers(HeaderUtil.createEntityCreationAlert(applicationName, false, ENTITY_NAME, bioDTO.getId().toString()))
            .body(bioDTO);
    }

    /**
     * {@code PUT  /bios/:id} : Updates an existing bio.
     *
     * @param id the id of the bioDTO to save.
     * @param bioDTO the bioDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated bioDTO,
     * or with status {@code 400 (Bad Request)} if the bioDTO is not valid,
     * or with status {@code 500 (Internal Server Error)} if the bioDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PutMapping("/{id}")
    public ResponseEntity<BioDTO> updateBio(@PathVariable(value = "id", required = false) final Long id, @Valid @RequestBody BioDTO bioDTO)
        throws URISyntaxException {
        LOG.debug("REST request to update Bio : {}, {}", id, bioDTO);
        if (bioDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, bioDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!bioRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        bioDTO = bioService.update(bioDTO);
        return ResponseEntity.ok()
            .headers(HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, bioDTO.getId().toString()))
            .body(bioDTO);
    }

    /**
     * {@code PATCH  /bios/:id} : Partial updates given fields of an existing bio, field will ignore if it is null
     *
     * @param id the id of the bioDTO to save.
     * @param bioDTO the bioDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated bioDTO,
     * or with status {@code 400 (Bad Request)} if the bioDTO is not valid,
     * or with status {@code 404 (Not Found)} if the bioDTO is not found,
     * or with status {@code 500 (Internal Server Error)} if the bioDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PatchMapping(value = "/{id}", consumes = { "application/json", "application/merge-patch+json" })
    public ResponseEntity<BioDTO> partialUpdateBio(
        @PathVariable(value = "id", required = false) final Long id,
        @NotNull @RequestBody BioDTO bioDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to partial update Bio partially : {}, {}", id, bioDTO);
        if (bioDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, bioDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!bioRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        Optional<BioDTO> result = bioService.partialUpdate(bioDTO);

        return ResponseUtil.wrapOrNotFound(
            result,
            HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, bioDTO.getId().toString())
        );
    }

    /**
     * {@code GET  /bios} : get all the bios.
     *
     * @param eagerload flag to eager load entities from relationships (This is applicable for many-to-many).
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the list of bios in body.
     */
    @GetMapping("")
    public List<BioDTO> getAllBios(@RequestParam(name = "eagerload", required = false, defaultValue = "true") boolean eagerload) {
        LOG.debug("REST request to get all Bios");
        return bioService.findAll();
    }

    /**
     * {@code GET  /bios/:id} : get the "id" bio.
     *
     * @param id the id of the bioDTO to retrieve.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the bioDTO, or with status {@code 404 (Not Found)}.
     */
    @GetMapping("/{id}")
    public ResponseEntity<BioDTO> getBio(@PathVariable("id") Long id) {
        LOG.debug("REST request to get Bio : {}", id);
        Optional<BioDTO> bioDTO = bioService.findOne(id);
        return ResponseUtil.wrapOrNotFound(bioDTO);
    }

    /**
     * {@code DELETE  /bios/:id} : delete the "id" bio.
     *
     * @param id the id of the bioDTO to delete.
     * @return the {@link ResponseEntity} with status {@code 204 (NO_CONTENT)}.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteBio(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete Bio : {}", id);
        bioService.delete(id);
        return ResponseEntity.noContent()
            .headers(HeaderUtil.createEntityDeletionAlert(applicationName, false, ENTITY_NAME, id.toString()))
            .build();
    }
}
