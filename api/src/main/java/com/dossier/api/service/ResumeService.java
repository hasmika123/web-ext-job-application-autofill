package com.dossier.api.service;

import com.dossier.api.service.dto.ResumeDTO;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * Service Interface for managing {@link com.dossier.api.domain.Resume}.
 */
public interface ResumeService {
    /**
     * Save a resume.
     *
     * @param resumeDTO the entity to save.
     * @return the persisted entity.
     */
    ResumeDTO save(ResumeDTO resumeDTO);

    /**
     * Updates a resume.
     *
     * @param resumeDTO the entity to update.
     * @return the persisted entity.
     */
    ResumeDTO update(ResumeDTO resumeDTO);

    /**
     * Partially updates a resume.
     *
     * @param resumeDTO the entity to update partially.
     * @return the persisted entity.
     */
    Optional<ResumeDTO> partialUpdate(ResumeDTO resumeDTO);

    /**
     * Get all the resumes.
     *
     * @param pageable the pagination information.
     * @return the list of entities.
     */
    Page<ResumeDTO> findAll(Pageable pageable);

    /**
     * Get all the resumes with eager load of many-to-many relationships.
     *
     * @param pageable the pagination information.
     * @return the list of entities.
     */
    Page<ResumeDTO> findAllWithEagerRelationships(Pageable pageable);

    /**
     * Get the "id" resume.
     *
     * @param id the id of the entity.
     * @return the entity.
     */
    Optional<ResumeDTO> findOne(Long id);

    /**
     * Delete the "id" resume.
     *
     * @param id the id of the entity.
     */
    void delete(Long id);
}
