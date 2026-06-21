package com.dossier.api.service.impl;

import com.dossier.api.domain.AiAnswer;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.service.AiAnswerService;
import com.dossier.api.service.dto.AiAnswerDTO;
import com.dossier.api.service.mapper.AiAnswerMapper;
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
 * Service Implementation for managing {@link com.dossier.api.domain.AiAnswer}.
 */
@Service
@Transactional
public class AiAnswerServiceImpl implements AiAnswerService {

    private static final Logger LOG = LoggerFactory.getLogger(AiAnswerServiceImpl.class);

    private final AiAnswerRepository aiAnswerRepository;

    private final AiAnswerMapper aiAnswerMapper;

    public AiAnswerServiceImpl(AiAnswerRepository aiAnswerRepository, AiAnswerMapper aiAnswerMapper) {
        this.aiAnswerRepository = aiAnswerRepository;
        this.aiAnswerMapper = aiAnswerMapper;
    }

    @Override
    public AiAnswerDTO save(AiAnswerDTO aiAnswerDTO) {
        LOG.debug("Request to save AiAnswer : {}", aiAnswerDTO);
        AiAnswer aiAnswer = aiAnswerMapper.toEntity(aiAnswerDTO);
        aiAnswer = aiAnswerRepository.save(aiAnswer);
        return aiAnswerMapper.toDto(aiAnswer);
    }

    @Override
    public AiAnswerDTO update(AiAnswerDTO aiAnswerDTO) {
        LOG.debug("Request to update AiAnswer : {}", aiAnswerDTO);
        AiAnswer aiAnswer = aiAnswerMapper.toEntity(aiAnswerDTO);
        aiAnswer = aiAnswerRepository.save(aiAnswer);
        return aiAnswerMapper.toDto(aiAnswer);
    }

    @Override
    public Optional<AiAnswerDTO> partialUpdate(AiAnswerDTO aiAnswerDTO) {
        LOG.debug("Request to partially update AiAnswer : {}", aiAnswerDTO);

        return aiAnswerRepository
            .findById(aiAnswerDTO.getId())
            .map(existingAiAnswer -> {
                aiAnswerMapper.partialUpdate(existingAiAnswer, aiAnswerDTO);

                return existingAiAnswer;
            })
            .map(aiAnswerRepository::save)
            .map(aiAnswerMapper::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AiAnswerDTO> findAll() {
        LOG.debug("Request to get all AiAnswers");
        return aiAnswerRepository.findAll().stream().map(aiAnswerMapper::toDto).collect(Collectors.toCollection(LinkedList::new));
    }

    public Page<AiAnswerDTO> findAllWithEagerRelationships(Pageable pageable) {
        return aiAnswerRepository.findAllWithEagerRelationships(pageable).map(aiAnswerMapper::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AiAnswerDTO> findOne(Long id) {
        LOG.debug("Request to get AiAnswer : {}", id);
        return aiAnswerRepository.findOneWithEagerRelationships(id).map(aiAnswerMapper::toDto);
    }

    @Override
    public void delete(Long id) {
        LOG.debug("Request to delete AiAnswer : {}", id);
        aiAnswerRepository.deleteById(id);
    }
}
