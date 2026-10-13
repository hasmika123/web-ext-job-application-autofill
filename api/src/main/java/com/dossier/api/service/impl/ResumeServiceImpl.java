package com.dossier.api.service.impl;

import com.dossier.api.domain.Resume;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.service.ResumeService;
import com.dossier.api.service.dto.ResumeDTO;
import com.dossier.api.service.mapper.ResumeMapper;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.StoredFileEraser;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service Implementation for managing {@link com.dossier.api.domain.Resume}.
 */
@Service
@Transactional
public class ResumeServiceImpl implements ResumeService {

    private static final Logger LOG = LoggerFactory.getLogger(ResumeServiceImpl.class);

    private final ResumeRepository resumeRepository;

    private final ResumeMapper resumeMapper;

    private final FileStorage storage;

    private final StoredFileEraser storedFileEraser;

    public ResumeServiceImpl(
        ResumeRepository resumeRepository,
        ResumeMapper resumeMapper,
        FileStorage storage,
        StoredFileEraser storedFileEraser
    ) {
        this.storage = storage;
        this.storedFileEraser = storedFileEraser;
        this.resumeRepository = resumeRepository;
        this.resumeMapper = resumeMapper;
    }

    @Override
    public ResumeDTO save(ResumeDTO resumeDTO) {
        LOG.debug("Request to save Resume : {}", resumeDTO);
        Resume resume = resumeMapper.toEntity(resumeDTO);
        resume = resumeRepository.save(resume);
        return resumeMapper.toDto(resume);
    }

    @Override
    public ResumeDTO update(ResumeDTO resumeDTO) {
        LOG.debug("Request to update Resume : {}", resumeDTO);
        Resume resume = resumeMapper.toEntity(resumeDTO);
        // The metadata a DTO round trip does not carry (R3.9) keeps its stored value instead of resetting.
        Resume existing = resumeRepository.findById(resumeDTO.getId()).orElse(null);
        if (existing != null) {
            resume.setCreatedByLogin(existing.getCreatedByLogin());
            resume.setUpdatedByLogin(existing.getUpdatedByLogin());
            resume.setShareWithOrg(existing.getShareWithOrg());
            if (resume.getRole() == null) resume.setRole(existing.getRole());
        }
        resume = resumeRepository.save(resume);
        return resumeMapper.toDto(resume);
    }

    @Override
    public Optional<ResumeDTO> partialUpdate(ResumeDTO resumeDTO) {
        LOG.debug("Request to partially update Resume : {}", resumeDTO);

        return resumeRepository
            .findById(resumeDTO.getId())
            .map(existingResume -> {
                resumeMapper.partialUpdate(existingResume, resumeDTO);

                return existingResume;
            })
            .map(resumeRepository::save)
            .map(resumeMapper::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<ResumeDTO> findAll(Pageable pageable) {
        LOG.debug("Request to get all Resumes");
        return resumeRepository.findAll(pageable).map(resumeMapper::toDto);
    }

    public Page<ResumeDTO> findAllWithEagerRelationships(Pageable pageable) {
        return resumeRepository.findAllWithEagerRelationships(pageable).map(resumeMapper::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ResumeDTO> findOne(Long id) {
        LOG.debug("Request to get Resume : {}", id);
        return resumeRepository.findOneWithEagerRelationships(id).map(resumeMapper::toDto);
    }

    @Override
    public void delete(Long id) {
        LOG.debug("Request to delete Resume : {}", id);
        // The raw (admin-only) CRUD must not orphan files either: blobs before the row, so a storage failure rolls back.
        resumeRepository
            .findById(id)
            .ifPresent(resume -> {
                String key = resume.getr2ObjectKey();
                if (key != null && !key.isBlank()) storage.delete(key);
                if (resume.getUser() != null) storedFileEraser.deleteResumeFiles(resume.getUser().getId(), id);
            });
        resumeRepository.deleteById(id);
    }
}
