package com.dossier.api.web.rest;

import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.service.AiAnswerService;
import com.dossier.api.service.dto.AiAnswerDTO;
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
 * REST controller for managing {@link com.dossier.api.domain.AiAnswer}.
 */
@RestController
@RequestMapping("/api/ai-answers")
public class AiAnswerResource {

    private static final Logger LOG = LoggerFactory.getLogger(AiAnswerResource.class);

    private static final String ENTITY_NAME = "aiAnswer";

    @Value("${jhipster.clientApp.name}")
    private String applicationName;

    private final AiAnswerService aiAnswerService;

    private final AiAnswerRepository aiAnswerRepository;

    public AiAnswerResource(AiAnswerService aiAnswerService, AiAnswerRepository aiAnswerRepository) {
        this.aiAnswerService = aiAnswerService;
        this.aiAnswerRepository = aiAnswerRepository;
    }

    /**
     * {@code POST  /ai-answers} : Create a new aiAnswer.
     *
     * @param aiAnswerDTO the aiAnswerDTO to create.
     * @return the {@link ResponseEntity} with status {@code 201 (Created)} and with body the new aiAnswerDTO, or with status {@code 400 (Bad Request)} if the aiAnswer has already an ID.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PostMapping("")
    public ResponseEntity<AiAnswerDTO> createAiAnswer(@Valid @RequestBody AiAnswerDTO aiAnswerDTO) throws URISyntaxException {
        LOG.debug("REST request to save AiAnswer : {}", aiAnswerDTO);
        if (aiAnswerDTO.getId() != null) {
            throw new BadRequestAlertException("A new aiAnswer cannot already have an ID", ENTITY_NAME, "idexists");
        }
        aiAnswerDTO = aiAnswerService.save(aiAnswerDTO);
        return ResponseEntity.created(new URI("/api/ai-answers/" + aiAnswerDTO.getId()))
            .headers(HeaderUtil.createEntityCreationAlert(applicationName, false, ENTITY_NAME, aiAnswerDTO.getId().toString()))
            .body(aiAnswerDTO);
    }

    /**
     * {@code PUT  /ai-answers/:id} : Updates an existing aiAnswer.
     *
     * @param id the id of the aiAnswerDTO to save.
     * @param aiAnswerDTO the aiAnswerDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated aiAnswerDTO,
     * or with status {@code 400 (Bad Request)} if the aiAnswerDTO is not valid,
     * or with status {@code 500 (Internal Server Error)} if the aiAnswerDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PutMapping("/{id}")
    public ResponseEntity<AiAnswerDTO> updateAiAnswer(
        @PathVariable(value = "id", required = false) final Long id,
        @Valid @RequestBody AiAnswerDTO aiAnswerDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to update AiAnswer : {}, {}", id, aiAnswerDTO);
        if (aiAnswerDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, aiAnswerDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!aiAnswerRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        aiAnswerDTO = aiAnswerService.update(aiAnswerDTO);
        return ResponseEntity.ok()
            .headers(HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, aiAnswerDTO.getId().toString()))
            .body(aiAnswerDTO);
    }

    /**
     * {@code PATCH  /ai-answers/:id} : Partial updates given fields of an existing aiAnswer, field will ignore if it is null
     *
     * @param id the id of the aiAnswerDTO to save.
     * @param aiAnswerDTO the aiAnswerDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated aiAnswerDTO,
     * or with status {@code 400 (Bad Request)} if the aiAnswerDTO is not valid,
     * or with status {@code 404 (Not Found)} if the aiAnswerDTO is not found,
     * or with status {@code 500 (Internal Server Error)} if the aiAnswerDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PatchMapping(value = "/{id}", consumes = { "application/json", "application/merge-patch+json" })
    public ResponseEntity<AiAnswerDTO> partialUpdateAiAnswer(
        @PathVariable(value = "id", required = false) final Long id,
        @NotNull @RequestBody AiAnswerDTO aiAnswerDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to partial update AiAnswer partially : {}, {}", id, aiAnswerDTO);
        if (aiAnswerDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, aiAnswerDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!aiAnswerRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        Optional<AiAnswerDTO> result = aiAnswerService.partialUpdate(aiAnswerDTO);

        return ResponseUtil.wrapOrNotFound(
            result,
            HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, aiAnswerDTO.getId().toString())
        );
    }

    /**
     * {@code GET  /ai-answers} : get all the aiAnswers.
     *
     * @param eagerload flag to eager load entities from relationships (This is applicable for many-to-many).
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the list of aiAnswers in body.
     */
    @GetMapping("")
    public List<AiAnswerDTO> getAllAiAnswers(@RequestParam(name = "eagerload", required = false, defaultValue = "true") boolean eagerload) {
        LOG.debug("REST request to get all AiAnswers");
        return aiAnswerService.findAll();
    }

    /**
     * {@code GET  /ai-answers/:id} : get the "id" aiAnswer.
     *
     * @param id the id of the aiAnswerDTO to retrieve.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the aiAnswerDTO, or with status {@code 404 (Not Found)}.
     */
    @GetMapping("/{id}")
    public ResponseEntity<AiAnswerDTO> getAiAnswer(@PathVariable("id") Long id) {
        LOG.debug("REST request to get AiAnswer : {}", id);
        Optional<AiAnswerDTO> aiAnswerDTO = aiAnswerService.findOne(id);
        return ResponseUtil.wrapOrNotFound(aiAnswerDTO);
    }

    /**
     * {@code DELETE  /ai-answers/:id} : delete the "id" aiAnswer.
     *
     * @param id the id of the aiAnswerDTO to delete.
     * @return the {@link ResponseEntity} with status {@code 204 (NO_CONTENT)}.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteAiAnswer(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete AiAnswer : {}", id);
        aiAnswerService.delete(id);
        return ResponseEntity.noContent()
            .headers(HeaderUtil.createEntityDeletionAlert(applicationName, false, ENTITY_NAME, id.toString()))
            .build();
    }
}
