package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.HrEmployeeNote;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code hr_employee_note}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface HrEmployeeNoteRepository extends Repository<HrEmployeeNote, Long> {
    <S extends HrEmployeeNote> S save(S entity);

    <S extends HrEmployeeNote> S saveAndFlush(S entity);

    void flush();

    <S extends HrEmployeeNote> List<S> saveAll(Iterable<S> entities);

    <S extends HrEmployeeNote> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<HrEmployeeNote> findByOrgIdAndId(Long orgId, Long id);

    List<HrEmployeeNote> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<HrEmployeeNote> findByOrgIdAndEmployeeIdOrderByCreatedAtDesc(Long orgId, Long employeeId);
}
