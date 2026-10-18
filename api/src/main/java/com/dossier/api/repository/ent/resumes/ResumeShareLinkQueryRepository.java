package com.dossier.api.repository.ent.resumes;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Repository;

/**
 * Two reads behind "consultant share links are paused while their organization has sharing off": which organizations link a person's resume into their
 * directory ({@code org_resume.resume_id}), and how many live share grants sit on the resumes one organization links. The first deliberately looks across
 * tenants (a public share link names no organization, so the organization is found from the resume), so this is not a Spring Data interface (the tenant
 * contract tests scan those). It returns organization ids and counts only, never a person's data.
 */
@Repository
public class ResumeShareLinkQueryRepository {

    @PersistenceContext
    private EntityManager em;

    /** The organizations whose directory links this resume (normally none or one). */
    public List<Long> orgIdsLinking(Long resumeId) {
        if (resumeId == null) return List.of();
        return em.createQuery("select distinct o.orgId from OrgResume o where o.resumeId = :resumeId", Long.class).setParameter("resumeId", resumeId).getResultList();
    }

    /** Live share grants (recruiter links and named people: not revoked, not expired) on the resumes {@code orgId} links into its directory. */
    public long countLiveShares(Long orgId, Instant now) {
        return em
            .createQuery(
                "select count(a) from ResumeAccess a where a.revokedAt is null and (a.expiresAt is null or a.expiresAt > :now) " +
                "and a.resumeId in (select o.resumeId from OrgResume o where o.orgId = :orgId and o.resumeId is not null)",
                Long.class
            )
            .setParameter("now", now)
            .setParameter("orgId", orgId)
            .getSingleResult();
    }
}
