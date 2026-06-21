package com.dossier.api.service;

import com.dossier.api.service.dto.FieldCacheDTO;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * Service Interface for managing {@link com.dossier.api.domain.FieldCache}.
 */
public interface FieldCacheService {
    /**
     * Save a fieldCache.
     *
     * @param fieldCacheDTO the entity to save.
     * @return the persisted entity.
     */
    FieldCacheDTO save(FieldCacheDTO fieldCacheDTO);

    /**
     * Updates a fieldCache.
     *
     * @param fieldCacheDTO the entity to update.
     * @return the persisted entity.
     */
    FieldCacheDTO update(FieldCacheDTO fieldCacheDTO);

    /**
     * Partially updates a fieldCache.
     *
     * @param fieldCacheDTO the entity to update partially.
     * @return the persisted entity.
     */
    Optional<FieldCacheDTO> partialUpdate(FieldCacheDTO fieldCacheDTO);

    /**
     * Get all the fieldCaches.
     *
     * @return the list of entities.
     */
    List<FieldCacheDTO> findAll();

    /**
     * Get all the fieldCaches with eager load of many-to-many relationships.
     *
     * @param pageable the pagination information.
     * @return the list of entities.
     */
    Page<FieldCacheDTO> findAllWithEagerRelationships(Pageable pageable);

    /**
     * Get the "id" fieldCache.
     *
     * @param id the id of the entity.
     * @return the entity.
     */
    Optional<FieldCacheDTO> findOne(Long id);

    /**
     * Delete the "id" fieldCache.
     *
     * @param id the id of the entity.
     */
    void delete(Long id);
}
