package com.dossier.api.service.impl;

import com.dossier.api.domain.Bio;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.service.BioService;
import com.dossier.api.service.dto.BioDTO;
import com.dossier.api.service.mapper.BioMapper;
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
 * Service Implementation for managing {@link com.dossier.api.domain.Bio}.
 */
@Service
@Transactional
public class BioServiceImpl implements BioService {

    private static final Logger LOG = LoggerFactory.getLogger(BioServiceImpl.class);

    private final BioRepository bioRepository;

    private final BioMapper bioMapper;

    public BioServiceImpl(BioRepository bioRepository, BioMapper bioMapper) {
        this.bioRepository = bioRepository;
        this.bioMapper = bioMapper;
    }

    @Override
    public BioDTO save(BioDTO bioDTO) {
        LOG.debug("Request to save Bio : {}", bioDTO);
        Bio bio = bioMapper.toEntity(bioDTO);
        bio = bioRepository.save(bio);
        return bioMapper.toDto(bio);
    }

    @Override
    public BioDTO update(BioDTO bioDTO) {
        LOG.debug("Request to update Bio : {}", bioDTO);
        Bio bio = bioMapper.toEntity(bioDTO);
        bio = bioRepository.save(bio);
        return bioMapper.toDto(bio);
    }

    @Override
    public Optional<BioDTO> partialUpdate(BioDTO bioDTO) {
        LOG.debug("Request to partially update Bio : {}", bioDTO);

        return bioRepository
            .findById(bioDTO.getId())
            .map(existingBio -> {
                bioMapper.partialUpdate(existingBio, bioDTO);

                return existingBio;
            })
            .map(bioRepository::save)
            .map(bioMapper::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public List<BioDTO> findAll() {
        LOG.debug("Request to get all Bios");
        return bioRepository.findAll().stream().map(bioMapper::toDto).collect(Collectors.toCollection(LinkedList::new));
    }

    public Page<BioDTO> findAllWithEagerRelationships(Pageable pageable) {
        return bioRepository.findAllWithEagerRelationships(pageable).map(bioMapper::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<BioDTO> findOne(Long id) {
        LOG.debug("Request to get Bio : {}", id);
        return bioRepository.findOneWithEagerRelationships(id).map(bioMapper::toDto);
    }

    @Override
    public void delete(Long id) {
        LOG.debug("Request to delete Bio : {}", id);
        bioRepository.deleteById(id);
    }
}
