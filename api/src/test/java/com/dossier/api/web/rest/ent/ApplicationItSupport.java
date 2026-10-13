package com.dossier.api.web.rest.ent;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

/** Test fixture rows of the Applications board: one client, one job, two consultants and one application (stage ASSIGNED) of an organization. */
public final class ApplicationItSupport {

    private ApplicationItSupport() {}

    private static final AtomicInteger SEQ = new AtomicInteger(100);

    /** {@code applicationId} is ASSIGNED; {@code spareConsultantId} has no application yet (what a legitimate "add" uses). */
    public record Rows(Long clientId, Long requirementId, Long consultantId, Long spareConsultantId, Long applicationId) {}

    public static Rows seed(EntityManager em, Long orgId, Long marketerMemberId) {
        ClientAccount client = client(em, orgId, "Fixture Client " + orgId);
        ClientRequirement job = job(em, orgId, client, "Fixture Engineer");
        ConsultantProfile one = consultant(em, orgId, "Fixture Consultant One");
        ConsultantProfile two = consultant(em, orgId, "Fixture Consultant Two");
        TalentApplication a = application(em, orgId, job, one, marketerMemberId, "ASSIGNED");
        return new Rows(client.getId(), job.getId(), one.getId(), two.getId(), a.getId());
    }

    public static ClientAccount client(EntityManager em, Long orgId, String name) {
        ClientAccount client = new ClientAccount();
        client.setOrgId(orgId);
        client.setName(name);
        em.persist(client);
        return client;
    }

    public static ClientRequirement job(EntityManager em, Long orgId, ClientAccount client, String title) {
        ClientRequirement job = new ClientRequirement();
        job.setOrgId(orgId);
        job.setClientId(client.getId());
        job.setTitle(title);
        job.setEmploymentLabel("FTE");
        em.persist(job);
        return job;
    }

    public static ConsultantProfile consultant(EntityManager em, Long orgId, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(orgId);
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.org");
        c.setJobTitle("Engineer");
        em.persist(c);
        return c;
    }

    public static TalentApplication application(EntityManager em, Long orgId, ClientRequirement job, ConsultantProfile c, Long marketerMemberId, String stage) {
        return application(em, orgId, job, c, marketerMemberId, stage, 3);
    }

    /** Created {@code daysAgo} days ago (applied date, CREATED event and creation time). */
    public static TalentApplication application(EntityManager em, Long orgId, ClientRequirement job, ConsultantProfile c, Long marketerMemberId, String stage, int daysAgo) {
        TalentApplication a = new TalentApplication();
        a.setOrgId(orgId);
        a.setCode("APP-2026-" + SEQ.incrementAndGet());
        a.setRequirementId(job.getId());
        a.setConsultantId(c.getId());
        a.setClientId(job.getClientId());
        a.setMarketerMemberId(marketerMemberId);
        a.setStage(stage);
        a.setAppliedOn(LocalDate.now().minusDays(daysAgo));
        a.setCreatedAt(Instant.now().minusSeconds(daysAgo * 86400L));
        a.setSourceLabel("Referral");
        a.setNextAction("Prepare application");
        a.setNextActionDue(LocalDate.now().plusDays(2));
        em.persist(a);
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setOrgId(orgId);
        e.setApplicationId(a.getId());
        e.setEventType("CREATED");
        e.setToStage("ASSIGNED");
        e.setActorMemberId(marketerMemberId);
        e.setDetail("Fixture");
        e.setOccurredAt(Instant.now().minusSeconds(daysAgo * 86400L));
        em.persist(e);
        em.flush();
        return a;
    }

    public static MarketerCapacity capacity(EntityManager em, Long orgId, Long memberId) {
        MarketerCapacity m = new MarketerCapacity();
        m.setOrgId(orgId);
        m.setMemberId(memberId);
        m.setCapacity(10);
        em.persist(m);
        em.flush();
        return m;
    }

    /** Everything observable about the applications of one organization (state, next action, marketer, number of events and notes). */
    public static String fingerprint(EntityManager em, Long orgId) {
        em.flush();
        em.clear();
        List<Object[]> apps = em.createQuery("select a.id, a.stage, a.nextAction, a.nextActionDue, a.marketerMemberId, a.closedReason from TalentApplication a where a.orgId = :o order by a.id", Object[].class).setParameter("o", orgId).getResultList();
        long events = ((Number) em.createQuery("select count(e) from TalentApplicationEvent e where e.orgId = :o").setParameter("o", orgId).getSingleResult()).longValue();
        long notes = ((Number) em.createQuery("select count(n) from TalentApplicationNote n where n.orgId = :o").setParameter("o", orgId).getSingleResult()).longValue();
        return "applications:" + apps.stream().map(Arrays::toString).collect(Collectors.joining(";")) + "|events:" + events + "|notes:" + notes + "\n";
    }
}
