package com.dossier.api.service.impl;

import com.dossier.api.domain.FieldCache;
import com.dossier.api.repository.FieldCacheRepository;
import com.dossier.api.service.FieldCacheService;
import com.dossier.api.service.dto.FieldCacheDTO;
import com.dossier.api.service.mapper.FieldCacheMapper;
import java.util.LinkedList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service Implementation for managing {@link com.dossier.api.domain.FieldCache}.
 */
@Service
@Transactional
public class FieldCacheServiceImpl implements FieldCacheService {

    private static final Logger LOG = LoggerFactory.getLogger(FieldCacheServiceImpl.class);

    private final FieldCacheRepository fieldCacheRepository;

    private final FieldCacheMapper fieldCacheMapper;

    public FieldCacheServiceImpl(FieldCacheRepository fieldCacheRepository, FieldCacheMapper fieldCacheMapper) {
        this.fieldCacheRepository = fieldCacheRepository;
        this.fieldCacheMapper = fieldCacheMapper;
    }

    @Override
    public FieldCacheDTO save(FieldCacheDTO fieldCacheDTO) {
        LOG.debug("Request to save FieldCache : {}", fieldCacheDTO);
        FieldCache fieldCache = fieldCacheMapper.toEntity(fieldCacheDTO);
        fieldCache = fieldCacheRepository.save(fieldCache);
        return fieldCacheMapper.toDto(fieldCache);
    }

    @Override
    public FieldCacheDTO update(FieldCacheDTO fieldCacheDTO) {
        LOG.debug("Request to update FieldCache : {}", fieldCacheDTO);
        FieldCache fieldCache = fieldCacheMapper.toEntity(fieldCacheDTO);
        fieldCache = fieldCacheRepository.save(fieldCache);
        return fieldCacheMapper.toDto(fieldCache);
    }

    @Override
    public Optional<FieldCacheDTO> partialUpdate(FieldCacheDTO fieldCacheDTO) {
        LOG.debug("Request to partially update FieldCache : {}", fieldCacheDTO);

        return fieldCacheRepository
            .findById(fieldCacheDTO.getId())
            .map(existingFieldCache -> {
                fieldCacheMapper.partialUpdate(existingFieldCache, fieldCacheDTO);

                return existingFieldCache;
            })
            .map(fieldCacheRepository::save)
            .map(fieldCacheMapper::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public List<FieldCacheDTO> findAll() {
        LOG.debug("Request to get all FieldCaches");
        return fieldCacheRepository.findAll().stream().map(fieldCacheMapper::toDto).collect(Collectors.toCollection(LinkedList::new));
    }

    public Page<FieldCacheDTO> findAllWithEagerRelationships(Pageable pageable) {
        return fieldCacheRepository.findAllWithEagerRelationships(pageable).map(fieldCacheMapper::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<FieldCacheDTO> findOne(Long id) {
        LOG.debug("Request to get FieldCache : {}", id);
        return fieldCacheRepository.findOneWithEagerRelationships(id).map(fieldCacheMapper::toDto);
    }

    @Override
    public void delete(Long id) {
        LOG.debug("Request to delete FieldCache : {}", id);
        fieldCacheRepository.deleteById(id);
    }
}
