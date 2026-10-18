package com.dossier.api.web.rest.ent;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.PlacementEvent;
import com.dossier.api.domain.ent.talent.PlacementExtension;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/** Test fixture rows of the Placements page: one client, two consultants, one ACTIVE placement (ends in 30 days) with a REQUESTED extension. */
public final class PlacementItSupport {

    private PlacementItSupport() {}

    /** {@code spareConsultantId} has no placement yet (what a legitimate "add" uses). */
    public record Rows(Long clientId, Long consultantId, Long spareConsultantId, Long placementId, Long extensionId) {}

    public static Rows seed(EntityManager em, Long orgId, Long managerMemberId) {
        ClientAccount client = ApplicationItSupport.client(em, orgId, "Placement Client " + orgId);
        ConsultantProfile one = ApplicationItSupport.consultant(em, orgId, "Placed Consultant");
        ConsultantProfile two = ApplicationItSupport.consultant(em, orgId, "Spare Consultant");
        TalentPlacement p = new TalentPlacement();
        p.setOrgId(orgId);
        p.setConsultantId(one.getId());
        p.setClientId(client.getId());
        p.setRoleTitle("Fixture Engineer");
        p.setStatus("ACTIVE");
        p.setStartDate(LocalDate.now().minusDays(60));
        p.setEndDate(LocalDate.now().plusDays(30));
        p.setBillRateMinor(10000L);
        p.setRateUnit("HOUR");
        p.setAccountManagerMemberId(managerMemberId);
        p.setCreatedAt(Instant.now().minusSeconds(60 * 86400L));
        em.persist(p);
        em.flush();
        PlacementExtension x = extension(em, orgId, p, "REQUESTED", managerMemberId);
        return new Rows(client.getId(), one.getId(), two.getId(), p.getId(), x.getId());
    }

    public static PlacementExtension extension(EntityManager em, Long orgId, TalentPlacement p, String status, Long by) {
        PlacementExtension x = new PlacementExtension();
        x.setOrgId(orgId);
        x.setPlacementId(p.getId());
        x.setStatus(status);
        x.setFromEndDate(p.getEndDate());
        x.setRequestedEndDate(p.getEndDate().plusDays(60));
        x.setRequestedByMemberId(by);
        em.persist(x);
        em.flush();
        return x;
    }

    /** Gives the placement an EXTENDED event by {@code actor}, a moment ago, that nothing follows: the thing Undo takes back. Returns its id. */
    public static Long undoableEvent(EntityManager em, Long orgId, Long placementId, Long actor) {
        TalentPlacement p = em.createQuery("select p from TalentPlacement p where p.orgId = :o and p.id = :id", TalentPlacement.class).setParameter("o", orgId).setParameter("id", placementId).getSingleResult();
        PlacementExtension x = extension(em, orgId, p, "APPROVED", actor);
        PlacementEvent e = new PlacementEvent();
        e.setOrgId(orgId);
        e.setPlacementId(placementId);
        e.setEventType("EXTENDED");
        e.setActorMemberId(actor);
        e.setRefId(x.getId());
        e.setPrevStatus(p.getStatus());
        e.setPrevEndDate(p.getEndDate());
        e.setPrevPool(p.isRedeploymentPool());
        e.setOccurredAt(Instant.now());
        em.persist(e);
        em.flush();
        return e.getId();
    }

    /** Everything observable about the placements of one organization (state, dates, pool, extensions, notes and events). */
    public static String fingerprint(EntityManager em, Long orgId) {
        em.flush();
        em.clear();
        List<Object[]> rows = em.createQuery("select p.id, p.status, p.endDate, p.redeploymentPool, p.redeploymentDate, p.accountManagerMemberId, p.completedAt from TalentPlacement p where p.orgId = :o order by p.id", Object[].class).setParameter("o", orgId).getResultList();
        List<Object[]> extStates = em.createQuery("select e.id, e.status from PlacementExtension e where e.orgId = :o order by e.id", Object[].class).setParameter("o", orgId).getResultList();
        long notes = ((Number) em.createQuery("select count(n) from PlacementNote n where n.orgId = :o").setParameter("o", orgId).getSingleResult()).longValue();
        long events = ((Number) em.createQuery("select count(e) from PlacementEvent e where e.orgId = :o").setParameter("o", orgId).getSingleResult()).longValue();
        return "placements:" + rows.stream().map(Arrays::toString).collect(Collectors.joining(";")) + "|ext:" + extStates.stream().map(Arrays::toString).collect(Collectors.joining(";")) + "|notes:" + notes + "|events:" + events + "\n";
    }
}
