package com.dossier.api.web.rest.org;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.service.ent.consultants.ConsultantQueryService;
import jakarta.persistence.EntityManager;

/**
 * The talent rows the Consultants routes of {@code OrgIsolationIT} need in a world: one consultant, one OPEN job of one client, and marketer capacity
 * for a seat (so a legitimate "assign marketer" call has somebody to name). Kept here so the shared IT only calls one method.
 */
final class ConsultantIsolationFixture {

    private ConsultantIsolationFixture() {}

    record Rows(Long consultantId, String consultantVersion, Long requirementId) {}

    static Rows create(EntityManager em, Long orgId, String prefix, Long marketerSeatId) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(orgId);
        c.setDisplayName(prefix + " Consultant");
        c.setEmail(prefix + "-consultant@example.org");
        c.setJobTitle("Engineer");
        c.setStatus("ACTIVE");
        em.persist(c);
        ClientAccount k = new ClientAccount();
        k.setOrgId(orgId);
        k.setName(prefix + " Consultants-board Client"); // distinct from the other fixtures client names (case-insensitive unique key per org)
        em.persist(k);
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(orgId);
        r.setClientId(k.getId());
        r.setTitle("Platform Engineer");
        r.setStatus("OPEN");
        em.persist(r);
        MarketerCapacity cap = new MarketerCapacity();
        cap.setOrgId(orgId);
        cap.setMemberId(marketerSeatId);
        cap.setCapacity(10);
        em.persist(cap);
        em.flush();
        em.refresh(c);
        return new Rows(c.getId(), ConsultantQueryService.versionOf(c), r.getId());
    }
}
