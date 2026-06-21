package com.dossier.api.service;

import com.dossier.api.service.dto.BioDTO;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * Service Interface for managing {@link com.dossier.api.domain.Bio}.
 */
public interface BioService {
    /**
     * Save a bio.
     *
     * @param bioDTO the entity to save.
     * @return the persisted entity.
     */
    BioDTO save(BioDTO bioDTO);

    /**
     * Updates a bio.
     *
     * @param bioDTO the entity to update.
     * @return the persisted entity.
     */
    BioDTO update(BioDTO bioDTO);

    /**
     * Partially updates a bio.
     *
     * @param bioDTO the entity to update partially.
     * @return the persisted entity.
     */
    Optional<BioDTO> partialUpdate(BioDTO bioDTO);

    /**
     * Get all the bios.
     *
     * @return the list of entities.
     */
    List<BioDTO> findAll();

    /**
     * Get all the bios with eager load of many-to-many relationships.
     *
     * @param pageable the pagination information.
     * @return the list of entities.
     */
    Page<BioDTO> findAllWithEagerRelationships(Pageable pageable);

    /**
     * Get the "id" bio.
     *
     * @param id the id of the entity.
     * @return the entity.
     */
    Optional<BioDTO> findOne(Long id);

    /**
     * Delete the "id" bio.
     *
     * @param id the id of the entity.
     */
    void delete(Long id);
}
