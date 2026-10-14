package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.HrEmployee;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code hr_employee}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface HrEmployeeRepository extends Repository<HrEmployee, Long> {
    <S extends HrEmployee> S save(S entity);

    <S extends HrEmployee> S saveAndFlush(S entity);

    void flush();

    <S extends HrEmployee> List<S> saveAll(Iterable<S> entities);

    <S extends HrEmployee> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<HrEmployee> findByOrgIdAndId(Long orgId, Long id);

    List<HrEmployee> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    long countByOrgIdAndEmploymentStatus(Long orgId, String employmentStatus);

    long countByOrgIdAndEmploymentStatusNot(Long orgId, String employmentStatus);

    long countByOrgIdAndOnboardingStage(Long orgId, String onboardingStage);

    Optional<HrEmployee> findByOrgIdAndMemberId(Long orgId, Long memberId);

    Optional<HrEmployee> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    List<HrEmployee> findByOrgIdOrderByDisplayNameAsc(Long orgId);

    /** Employees on the books on a date: started on or before it and not ended by it ("Total Employees" now and at T-30). */
    @Query("select count(e) from HrEmployee e where e.orgId = :orgId and e.startDate <= :on and (e.endDate is null or e.endDate > :on)")
    long countEmployedOn(@Param("orgId") Long orgId, @Param("on") LocalDate on);

    /** Onboarding in progress at an instant: started by then and not completed by then ("Onboarding In Progress" now and at T-30). */
    @Query("select count(e) from HrEmployee e where e.orgId = :orgId and e.onboardingStartedAt is not null and e.onboardingStartedAt <= :at and (e.onboardingCompletedAt is null or e.onboardingCompletedAt > :at)")
    long countOnboardingInProgressAt(@Param("orgId") Long orgId, @Param("at") Instant at);

    /** The Employee Directory list: every filter optional ({@code null} = no filter, {@code q} empty = all); {@code q} (lower case) matches name, work email, title. */
    @Query("select e from HrEmployee e where e.orgId = :orgId and (:departmentId is null or e.departmentGroupId = :departmentId) "
        + "and (:status is null or e.employmentStatus = :status) and (:stage is null or e.onboardingStage = :stage) "
        + "and (:q = '' or lower(e.displayName) like concat('%', :q, '%') or lower(e.workEmail) like concat('%', :q, '%') or lower(e.jobTitle) like concat('%', :q, '%'))")
    Page<HrEmployee> search(@Param("orgId") Long orgId, @Param("departmentId") Long departmentId, @Param("status") String status, @Param("stage") String stage, @Param("q") String q, Pageable pageable);

    @Query("select e.employmentStatus, count(e) from HrEmployee e where e.orgId = :orgId group by e.employmentStatus")
    List<Object[]> countByStatus(@Param("orgId") Long orgId);
}
