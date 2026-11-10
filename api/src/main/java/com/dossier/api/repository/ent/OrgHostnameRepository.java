package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.org.Organization;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Hostnames of organizations. Like every tenant repository it is a bare {@link Repository} (no {@code findById}) and
 * every method names the organization first. The two exceptions exist to FIND the tenant from a host, so they cannot
 * take an organization id: {@link #findActiveByHostname} and {@link #findBySubdomain}; both are allow-listed, by name, in
 * {@code EntRepositoryContractTest}. Neither can return anything but a row the caller is entitled to learn from the host
 * alone (an ACTIVE hostname, or the organization that owns a subdomain label).
 *
 * <p>Callers pass canonical hostnames ({@code HostNames.normalise}).
 */
public interface OrgHostnameRepository extends Repository<OrgHostname, Long> {
    <S extends OrgHostname> S save(S hostname);

    <S extends OrgHostname> S saveAndFlush(S hostname);

    @Query("select h from OrgHostname h where h.orgId = :orgId and h.id = :id")
    Optional<OrgHostname> findByOrgIdAndId(@Param("orgId") Long orgId, @Param("id") Long id);

    /** Every hostname of the organization, REMOVED ones included (they are history), oldest first. */
    @Query("select h from OrgHostname h where h.orgId = :orgId order by h.createdAt asc, h.id asc")
    List<OrgHostname> findByOrgIdOrderByCreatedAt(@Param("orgId") Long orgId);

    /** The organization's live (not REMOVED) claim on {@code hostname}, if any. */
    @Query("select h from OrgHostname h where h.orgId = :orgId and h.hostname = :hostname and h.status <> com.dossier.api.domain.enumeration.OrgHostnameStatus.REMOVED")
    Optional<OrgHostname> findLiveByOrgIdAndHostname(@Param("orgId") Long orgId, @Param("hostname") String hostname);

    /** The organization's live primary hostname, if it has one. */
    @Query("select h from OrgHostname h where h.orgId = :orgId and h.primary = true and h.status <> com.dossier.api.domain.enumeration.OrgHostnameStatus.REMOVED")
    Optional<OrgHostname> findPrimaryByOrgId(@Param("orgId") Long orgId);

    /** How many hostnames of the organization are in {@code status} (the admin page badges). */
    @Query("select count(h) from OrgHostname h where h.orgId = :orgId and h.status = :status")
    long countByOrgIdAndStatus(@Param("orgId") Long orgId, @Param("status") com.dossier.api.domain.enumeration.OrgHostnameStatus status);

    /** Tenant lookup by host: the ACTIVE row for {@code hostname}, whichever organization owns it. Nothing but ACTIVE ever matches. */
    @Query("select h from OrgHostname h where h.hostname = :hostname and h.status = com.dossier.api.domain.enumeration.OrgHostnameStatus.ACTIVE")
    Optional<OrgHostname> findActiveByHostname(@Param("hostname") String hostname);

    /** Tenant lookup by subdomain label: the organization that owns {@code {label}.kiwiply.com}, enabled or not (the caller checks). */
    @Query("select o from Organization o where o.subdomain = :label")
    Optional<Organization> findBySubdomain(@Param("label") String label);
}
