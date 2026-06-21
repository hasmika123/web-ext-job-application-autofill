package com.dossier.api.service;

import com.dossier.api.domain.*; // for static metamodels
import com.dossier.api.domain.Application;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.service.criteria.ApplicationCriteria;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.mapper.ApplicationMapper;
import jakarta.persistence.criteria.JoinType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.jhipster.service.QueryService;

/**
 * Service for executing complex queries for {@link Application} entities in the database.
 * The main input is a {@link ApplicationCriteria} which gets converted to {@link Specification},
 * in a way that all the filters must apply.
 * It returns a {@link Page} of {@link ApplicationDTO} which fulfills the criteria.
 */
@Service
@Transactional(readOnly = true)
public class ApplicationQueryService extends QueryService<Application> {

    private static final Logger LOG = LoggerFactory.getLogger(ApplicationQueryService.class);

    private final ApplicationRepository applicationRepository;

    private final ApplicationMapper applicationMapper;

    public ApplicationQueryService(ApplicationRepository applicationRepository, ApplicationMapper applicationMapper) {
        this.applicationRepository = applicationRepository;
        this.applicationMapper = applicationMapper;
    }

    /**
     * Return a {@link Page} of {@link ApplicationDTO} which matches the criteria from the database.
     * @param criteria The object which holds all the filters, which the entities should match.
     * @param page The page, which should be returned.
     * @return the matching entities.
     */
    @Transactional(readOnly = true)
    public Page<ApplicationDTO> findByCriteria(ApplicationCriteria criteria, Pageable page) {
        LOG.debug("find by criteria : {}, page: {}", criteria, page);
        final Specification<Application> specification = createSpecification(criteria);
        return applicationRepository.findAll(specification, page).map(applicationMapper::toDto);
    }

    /**
     * Return the number of matching entities in the database.
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the number of matching entities.
     */
    @Transactional(readOnly = true)
    public long countByCriteria(ApplicationCriteria criteria) {
        LOG.debug("count by criteria : {}", criteria);
        final Specification<Application> specification = createSpecification(criteria);
        return applicationRepository.count(specification);
    }

    /**
     * Function to convert {@link ApplicationCriteria} to a {@link Specification}
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the matching {@link Specification} of the entity.
     */
    protected Specification<Application> createSpecification(ApplicationCriteria criteria) {
        Specification<Application> specification = Specification.where(null);
        if (criteria != null) {
            // This has to be called first, because the distinct method returns null
            specification = Specification.allOf(
                Boolean.TRUE.equals(criteria.getDistinct()) ? distinct(criteria.getDistinct()) : null,
                buildRangeSpecification(criteria.getId(), Application_.id),
                buildStringSpecification(criteria.getCompany(), Application_.company),
                buildStringSpecification(criteria.getRoleTitle(), Application_.roleTitle),
                buildStringSpecification(criteria.getJobUrl(), Application_.jobUrl),
                buildStringSpecification(criteria.getAtsPlatform(), Application_.atsPlatform),
                buildSpecification(criteria.getStatus(), Application_.status),
                buildStringSpecification(criteria.getSource(), Application_.source),
                buildRangeSpecification(criteria.getAppliedAt(), Application_.appliedAt),
                buildRangeSpecification(criteria.getCreatedAt(), Application_.createdAt),
                buildRangeSpecification(criteria.getUpdatedAt(), Application_.updatedAt),
                buildSpecification(criteria.getUserId(), root -> root.join(Application_.user, JoinType.LEFT).get(User_.id)),
                buildSpecification(criteria.getResumeId(), root -> root.join(Application_.resume, JoinType.LEFT).get(Resume_.id))
            );
        }
        return specification;
    }
}
