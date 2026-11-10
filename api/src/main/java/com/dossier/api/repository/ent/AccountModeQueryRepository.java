package com.dossier.api.repository.ent;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Repository;

/**
 * The platform admin's account-mode reads (decision O4, docs/enterprise-v2/19 phase S10): which seats of an organization still point at PERSONAL accounts, and the
 * invariants of the separate-accounts model. Like {@link AdminOrgQueryRepository} this deliberately looks across tenants, so it is not a Spring Data interface (the
 * tenant contract tests scan those) and is only called from admin services behind {@code ROLE_ADMIN}. It returns ids and counts, never an address or a login.
 */
@Repository
public class AccountModeQueryRepository {

    /** A live seat (ACTIVE or SUSPENDED) and the personal account it points at. */
    public record PersonalSeat(Long memberId, Long userId) {}

    @PersistenceContext
    private EntityManager em;

    /** Live seats of {@code orgId} whose account is a personal one ({@code jhi_user.org_id IS NULL}): the pre-flip check query of doc 19 section 5.3. */
    public long countSeatsOnPersonalAccounts(Long orgId) {
        return count("select count(*) from org_member m join jhi_user u on u.id = m.user_id where m.org_id = ?1 and m.status in ('ACTIVE','SUSPENDED') and u.org_id is null", orgId);
    }

    /** Live seats of {@code orgId} whose account is an enterprise account of that same organization. */
    public long countSeatsOnEnterpriseAccounts(Long orgId) {
        return count("select count(*) from org_member m join jhi_user u on u.id = m.user_id where m.org_id = ?1 and m.status in ('ACTIVE','SUSPENDED') and u.org_id = m.org_id", orgId);
    }

    public List<PersonalSeat> seatsOnPersonalAccounts(Long orgId) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em
            .createNativeQuery("select m.id, m.user_id from org_member m join jhi_user u on u.id = m.user_id where m.org_id = ?1 and m.status in ('ACTIVE','SUSPENDED') and u.org_id is null order by m.id")
            .setParameter(1, orgId)
            .getResultList();
        List<PersonalSeat> out = new ArrayList<>();
        for (Object[] r : rows) out.add(new PersonalSeat(((Number) r[0]).longValue(), ((Number) r[1]).longValue()));
        return out;
    }

    /** SHARED organizations that hold at least one live seat on a personal account: the work list of the migration report. */
    public List<Long> sharedOrgIdsWithPersonalSeats() {
        @SuppressWarnings("unchecked")
        List<Number> rows = em
            .createNativeQuery(
                "select distinct o.id from organization o join org_member m on m.org_id = o.id join jhi_user u on u.id = m.user_id " +
                "where o.account_mode = 'SHARED' and m.status in ('ACTIVE','SUSPENDED') and u.org_id is null order by o.id"
            )
            .getResultList();
        return rows.stream().map(Number::longValue).toList();
    }

    // ---- invariants (doc 19 section 1.3), counts only ---------------------------------------------------------------------------------

    /** Enterprise accounts with no seat row at all in their organization (a live seat, or an ended one that anchors the retention window). */
    public long countEnterpriseAccountsWithoutSeat() {
        return count("select count(*) from jhi_user u where u.org_id is not null and not exists (select 1 from org_member m where m.user_id = u.id and m.org_id = u.org_id)", null);
    }

    /** (organization, address) pairs held by more than one enterprise account. */
    public long countDuplicateEnterpriseEmails() {
        return count(
            "select count(*) from (select u.org_id from jhi_user u where u.org_id is not null and u.email is not null group by u.org_id, lower(u.email) having count(*) > 1) d", null
        );
    }

    /** Enterprise accounts that own a {@code subscription} row (an enterprise account never has a personal plan). Read-only: this class touches no billing code. */
    public long countEnterpriseAccountsWithSubscription() {
        return count("select count(*) from subscription s join jhi_user u on u.id = s.user_id where u.org_id is not null", null);
    }

    /** Personal accounts (org_id null) whose login is in the {@code ent#} namespace. */
    public long countPersonalAccountsWithEnterpriseLogin() {
        return count("select count(*) from jhi_user u where u.org_id is null and u.login like 'ent#%'", null);
    }

    /** Enterprise accounts whose login does not start with {@code ent#<their org id>#}. */
    public long countEnterpriseAccountsWithForeignLogin() {
        return count("select count(*) from jhi_user u where u.org_id is not null and u.login not like concat('ent#', u.org_id, '#%')", null);
    }

    /** Live seats of SEPARATE organizations that point at a personal account or at another organization's account. */
    public long countSeparateSeatsOnWrongAccount() {
        return count(
            "select count(*) from org_member m join organization o on o.id = m.org_id join jhi_user u on u.id = m.user_id " +
            "where o.account_mode = 'SEPARATE' and m.status in ('INVITED','ACTIVE','SUSPENDED') and (u.org_id is null or u.org_id <> m.org_id)",
            null
        );
    }

    /** Seats (any organization, any state) that point at the enterprise account of a DIFFERENT organization. */
    public long countSeatsOnForeignEnterpriseAccount() {
        return count("select count(*) from org_member m join jhi_user u on u.id = m.user_id where u.org_id is not null and u.org_id <> m.org_id", null);
    }

    /** Enterprise accounts that hold any authority other than ROLE_USER. */
    public long countEnterpriseAccountsWithPrivilegedAuthority() {
        return count("select count(distinct u.id) from jhi_user u join jhi_user_authority a on a.user_id = u.id where u.org_id is not null and a.authority_name <> 'ROLE_USER'", null);
    }

    private long count(String sql, Long param) {
        var q = em.createNativeQuery(sql);
        if (param != null) q.setParameter(1, param);
        return ((Number) q.getSingleResult()).longValue();
    }
}
