package com.dossier.api.service;

import com.dossier.api.service.dto.AiAnswerDTO;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * Service Interface for managing {@link com.dossier.api.domain.AiAnswer}.
 */
public interface AiAnswerService {
    /**
     * Save a aiAnswer.
     *
     * @param aiAnswerDTO the entity to save.
     * @return the persisted entity.
     */
    AiAnswerDTO save(AiAnswerDTO aiAnswerDTO);

    /**
     * Updates a aiAnswer.
     *
     * @param aiAnswerDTO the entity to update.
     * @return the persisted entity.
     */
    AiAnswerDTO update(AiAnswerDTO aiAnswerDTO);

    /**
     * Partially updates a aiAnswer.
     *
     * @param aiAnswerDTO the entity to update partially.
     * @return the persisted entity.
     */
    Optional<AiAnswerDTO> partialUpdate(AiAnswerDTO aiAnswerDTO);

    /**
     * Get all the aiAnswers.
     *
     * @return the list of entities.
     */
    List<AiAnswerDTO> findAll();

    /**
     * Get all the aiAnswers with eager load of many-to-many relationships.
     *
     * @param pageable the pagination information.
     * @return the list of entities.
     */
    Page<AiAnswerDTO> findAllWithEagerRelationships(Pageable pageable);

    /**
     * Get the "id" aiAnswer.
     *
     * @param id the id of the entity.
     * @return the entity.
     */
    Optional<AiAnswerDTO> findOne(Long id);

    /**
     * Delete the "id" aiAnswer.
     *
     * @param id the id of the entity.
     */
    void delete(Long id);
}
