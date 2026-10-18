package com.dossier.api.repository;

import com.dossier.api.domain.User;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the {@link User} entity.
 */
@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    String USERS_BY_LOGIN_CACHE = "usersByLogin";

    String USERS_BY_EMAIL_CACHE = "usersByEmail";
    Optional<User> findOneByActivationKey(String activationKey);
    List<User> findAllByActivatedIsFalseAndActivationKeyIsNotNullAndCreatedDateBefore(Instant dateTime);
    Optional<User> findOneByResetKey(String resetKey);

    // ---- email lookups are ALWAYS scoped (decision O4, docs/enterprise-v2/19): the same address may be a personal account (org_id NULL) and one
    // enterprise account per organization, so an unscoped lookup could match two rows and throw. There is deliberately no unscoped finder
    // (TechnicalStructureTest enforces it). Pick the scope with the two finders below, or findOneByScopeAndEmail when the scope is a variable.

    /** The PERSONAL account (no organization) with this email, ignoring case. Never returns an enterprise account. */
    Optional<User> findOneByOrgIdIsNullAndEmailIgnoreCase(String email);

    /** The ENTERPRISE account of organization {@code orgId} with this email, ignoring case. Never returns a personal account; a null {@code orgId} matches nothing. */
    @Query("select u from User u where u.orgId = :orgId and lower(u.email) = lower(:email)")
    Optional<User> findOneByOrgIdAndEmailIgnoreCase(@Param("orgId") Long orgId, @Param("email") String email);

    /** {@code orgId} null = the personal scope, otherwise that organization's enterprise accounts. */
    default Optional<User> findOneByScopeAndEmail(Long orgId, String email) {
        return orgId == null ? findOneByOrgIdIsNullAndEmailIgnoreCase(email) : findOneByOrgIdAndEmailIgnoreCase(orgId, email);
    }

    /** The cache key of the by-email caches: scope first, lower-cased address, so eviction and lookup always agree. */
    static String emailCacheKey(Long orgId, String email) {
        return (orgId == null ? "P:" : "E" + orgId + ":") + (email == null ? "" : email.toLowerCase(java.util.Locale.ROOT));
    }
    Optional<User> findOneByLogin(String login);

    /** Display-name lookups for many logins at once (resume "created by / updated by" labels). */
    List<User> findAllByLoginIn(java.util.Collection<String> logins);

    @EntityGraph(attributePaths = "authorities")
    @Cacheable(cacheNames = USERS_BY_LOGIN_CACHE, unless = "#result == null")
    Optional<User> findOneWithAuthoritiesByLogin(String login);

    @EntityGraph(attributePaths = "authorities")
    @Cacheable(cacheNames = USERS_BY_EMAIL_CACHE, key = "'P:' + (#p0 == null ? '' : #p0.toLowerCase())", unless = "#result == null")
    Optional<User> findOneWithAuthoritiesByOrgIdIsNullAndEmailIgnoreCase(String email);

    @Cacheable(cacheNames = USERS_BY_EMAIL_CACHE, key = "'E' + #p0 + ':' + (#p1 == null ? '' : #p1.toLowerCase())", unless = "#result == null")
    @Query("select distinct u from User u left join fetch u.authorities where u.orgId = :orgId and lower(u.email) = lower(:email)")
    Optional<User> findOneWithAuthoritiesByOrgIdAndEmailIgnoreCase(@Param("orgId") Long orgId, @Param("email") String email);

    // ---- platform admin lists and counts are PERSONAL accounts only: enterprise accounts show under their organization ----

    Page<User> findAllByOrgIdIsNull(Pageable pageable);

    Page<User> findAllByOrgIdIsNullAndActivatedIsTrue(Pageable pageable);

    // --- Admin analytics (Phase 9.A3) ---
    long countByOrgIdIsNull();

    long countByOrgIdIsNullAndActivatedIsTrue();

    long countByOrgIdIsNullAndCreatedDateAfter(Instant cutoff);
}
