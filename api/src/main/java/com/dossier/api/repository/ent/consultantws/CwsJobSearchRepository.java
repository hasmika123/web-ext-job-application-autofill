package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Job Discovery's search over OPEN {@code client_requirement} rows. A marker repository on purpose: only the methods below exist, and
 * every one takes the organization id first, so there is no unscoped {@code findById}. Text parameters are passed lower-cased and
 * LIKE-escaped (escape character {@code !}) by the service; an empty string means "no filter", zero means "no rate floor / any client".
 */
public interface CwsJobSearchRepository extends Repository<ClientRequirement, Long> {

    String FILTER =
        " from ClientRequirement r where r.orgId = :orgId and r.status = 'OPEN' and r.postedAt >= :since"
        + " and (:q = '' or lower(r.title) like :q escape '!' or lower(coalesce(r.descriptionText, '')) like :q escape '!'"
        + "   or exists (select 1 from RequirementSkill s where s.orgId = :orgId and s.requirementId = r.id and lower(s.skill) like :q escape '!')"
        + "   or exists (select 1 from ClientAccount a where a.orgId = :orgId and a.id = r.clientId and lower(a.name) like :q escape '!'))"
        + " and (:loc = '' or lower(coalesce(r.location, '')) like :loc escape '!')"
        + " and (:workMode = '' or r.workMode = :workMode)"
        + " and (:employment = '' or r.employmentLabel = :employment)"
        + " and (:experience = '' or r.experienceLevel = :experience)"
        + " and (:clientId = 0L or r.clientId = :clientId)"
        + " and (:industry = '' or exists (select 1 from ClientAccount a2 where a2.orgId = :orgId and a2.id = r.clientId and a2.industry = :industry))"
        + " and (:skill = '' or exists (select 1 from RequirementSkill s2 where s2.orgId = :orgId and s2.requirementId = r.id and lower(s2.skill) = :skill))"
        + " and (:minRate = 0L or (r.rateUnit = 'HOUR' and r.rateMaxMinor >= :minRate))";

    @Query(value = "select r" + FILTER, countQuery = "select count(r)" + FILTER)
    Page<ClientRequirement> search(
        @Param("orgId") Long orgId, @Param("since") Instant since, @Param("q") String q, @Param("loc") String loc, @Param("workMode") String workMode,
        @Param("employment") String employment, @Param("experience") String experience, @Param("clientId") long clientId,
        @Param("industry") String industry, @Param("skill") String skill, @Param("minRate") long minRate, Pageable page
    );

    @Query("select count(r)" + FILTER)
    long countSearch(
        @Param("orgId") Long orgId, @Param("since") Instant since, @Param("q") String q, @Param("loc") String loc, @Param("workMode") String workMode,
        @Param("employment") String employment, @Param("experience") String experience, @Param("clientId") long clientId,
        @Param("industry") String industry, @Param("skill") String skill, @Param("minRate") long minRate
    );

    /** One job of this organization, any status (empty for another tenant's id, exactly like a missing one). */
    @Query("select r from ClientRequirement r where r.orgId = :orgId and r.id = :id")
    List<ClientRequirement> byId(@Param("orgId") Long orgId, @Param("id") Long id);

    @Query("select distinct r.employmentLabel from ClientRequirement r where r.orgId = :orgId and r.status = 'OPEN' and r.employmentLabel is not null")
    List<String> openEmploymentLabels(@Param("orgId") Long orgId);

    @Query("select distinct r.experienceLevel from ClientRequirement r where r.orgId = :orgId and r.status = 'OPEN' and r.experienceLevel is not null")
    List<String> openExperienceLevels(@Param("orgId") Long orgId);

    /** [workMode, count] over OPEN jobs. */
    @Query("select r.workMode, count(r) from ClientRequirement r where r.orgId = :orgId and r.status = 'OPEN' and r.workMode is not null group by r.workMode")
    List<Object[]> openWorkModeCounts(@Param("orgId") Long orgId);

    /** [employmentLabel, count] over OPEN jobs. */
    @Query("select r.employmentLabel, count(r) from ClientRequirement r where r.orgId = :orgId and r.status = 'OPEN' and r.employmentLabel is not null group by r.employmentLabel")
    List<Object[]> openEmploymentCounts(@Param("orgId") Long orgId);

    /** [clientId, count] over OPEN jobs. */
    @Query("select r.clientId, count(r) from ClientRequirement r where r.orgId = :orgId and r.status = 'OPEN' group by r.clientId")
    List<Object[]> openClientCounts(@Param("orgId") Long orgId);

    /** The lower end of every OPEN hourly job's range, ascending (for the "rate" suggestion). */
    @Query("select r.rateMinMinor from ClientRequirement r where r.orgId = :orgId and r.status = 'OPEN' and r.rateUnit = 'HOUR' and r.rateMinMinor is not null order by r.rateMinMinor")
    List<Long> openHourlyRateFloors(@Param("orgId") Long orgId);

    /** [skill, openJobCount] ranked by demand among OPEN jobs. */
    @Query("select s.skill, count(distinct r.id) from RequirementSkill s, ClientRequirement r where s.orgId = :orgId and r.orgId = :orgId and s.requirementId = r.id and r.status = 'OPEN' group by s.skill order by count(distinct r.id) desc, s.skill asc")
    List<Object[]> openSkillDemand(@Param("orgId") Long orgId, Pageable page);

    /** [skill, postingCount]: jobs (any status) carrying the skill that were posted in {@code [from, to)}. */
    @Query("select s.skill, count(distinct r.id) from RequirementSkill s, ClientRequirement r where s.orgId = :orgId and r.orgId = :orgId and s.requirementId = r.id and r.postedAt >= :from and r.postedAt < :to group by s.skill")
    List<Object[]> postingsBySkill(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to);

    @Query("select count(r) from ClientRequirement r where r.orgId = :orgId and r.status = 'OPEN'")
    long countOpen(@Param("orgId") Long orgId);
}
