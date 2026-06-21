package com.dossier.api.service.impl;

import com.dossier.api.domain.Application;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.service.ApplicationService;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.mapper.ApplicationMapper;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service Implementation for managing {@link com.dossier.api.domain.Application}.
 */
@Service
@Transactional
public class ApplicationServiceImpl implements ApplicationService {

    private static final Logger LOG = LoggerFactory.getLogger(ApplicationServiceImpl.class);

    private final ApplicationRepository applicationRepository;

    private final ApplicationMapper applicationMapper;

    public ApplicationServiceImpl(ApplicationRepository applicationRepository, ApplicationMapper applicationMapper) {
        this.applicationRepository = applicationRepository;
        this.applicationMapper = applicationMapper;
    }

    @Override
    public ApplicationDTO save(ApplicationDTO applicationDTO) {
        LOG.debug("Request to save Application : {}", applicationDTO);
        Application application = applicationMapper.toEntity(applicationDTO);
        application = applicationRepository.save(application);
        return applicationMapper.toDto(application);
    }

    @Override
    public ApplicationDTO update(ApplicationDTO applicationDTO) {
        LOG.debug("Request to update Application : {}", applicationDTO);
        Application application = applicationMapper.toEntity(applicationDTO);
        application = applicationRepository.save(application);
        return applicationMapper.toDto(application);
    }

    @Override
    public Optional<ApplicationDTO> partialUpdate(ApplicationDTO applicationDTO) {
        LOG.debug("Request to partially update Application : {}", applicationDTO);

        return applicationRepository
            .findById(applicationDTO.getId())
            .map(existingApplication -> {
                applicationMapper.partialUpdate(existingApplication, applicationDTO);

                return existingApplication;
            })
            .map(applicationRepository::save)
            .map(applicationMapper::toDto);
    }

    public Page<ApplicationDTO> findAllWithEagerRelationships(Pageable pageable) {
        return applicationRepository.findAllWithEagerRelationships(pageable).map(applicationMapper::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ApplicationDTO> findOne(Long id) {
        LOG.debug("Request to get Application : {}", id);
        return applicationRepository.findOneWithEagerRelationships(id).map(applicationMapper::toDto);
    }

    @Override
    public void delete(Long id) {
        LOG.debug("Request to delete Application : {}", id);
        applicationRepository.deleteById(id);
    }
}
