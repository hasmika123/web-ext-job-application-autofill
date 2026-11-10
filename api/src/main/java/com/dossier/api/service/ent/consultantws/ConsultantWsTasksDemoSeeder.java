package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsTask;
import com.dossier.api.domain.ent.consultantws.CwsTaskDetail;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsTaskAccessRepository;
import com.dossier.api.repository.ent.consultantws.CwsTaskDetailRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo rows for the Tasks and Follow-ups page, for the consultants who are real seats (Anika, Ben, Sam): a task type and (where it fits) a linked job
 * for the five tasks {@link ConsultantWsDemoSeeder} already made, plus a few more tasks (overdue, due this week, completed this and last week).
 * "Assigned by a marketer" is a SAMPLE stand-in (a display label with {@code sample_data = true}); the marketer role does not exist in this branch.
 * Call it after {@link ConsultantWsDemoSeeder}. Idempotent: a consultant who already has a {@code cws_task_detail} row is skipped.
 */
@Service
public class ConsultantWsTasksDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsTasksDemoSeeder.class);

    /** Detail for the tasks the base demo seeder created, by title: type, marketer label (null = self-made), index of the job among the consultant's matches (-1 = none). */
    private record Detail(String title, String type, String by, int job) {}

    private static final List<Detail> EXISTING = List.of(
        new Detail("Complete interview preparation", "INTERVIEW_PREPARATION", null, 0),
        new Detail("Respond to marketer message", "COMMUNICATION", "Michael Park", -1),
        new Detail("Update resume with latest project", "RESUME_PROFILE", null, 1),
        new Detail("Follow up on pending application", "COMMUNICATION", "Emily Lawson", 2),
        new Detail("Set availability for next month", "AVAILABILITY", null, -1)
    );

    /** More tasks: title, type, days until due (negative = overdue), priority, status, days ago completed (-1 = not done), marketer label, job index. */
    private record Extra(String title, String type, int due, String priority, String status, int doneAgo, String by, int job) {}

    private static final List<Extra> EXTRAS = List.of(
        new Extra("Approve submission for the data role", "SUBMISSION_APPROVAL", -2, "HIGH", "PENDING", -1, "Emily Lawson", 3),
        new Extra("Confirm interview details", "INTERVIEW_COORDINATION", -1, "HIGH", "NOT_STARTED", -1, "Emily Lawson", 0),
        new Extra("Respond to the client questionnaire", "CLIENT_REQUIREMENTS", 1, "MEDIUM", "NOT_STARTED", -1, "Michael Park", 4),
        new Extra("Review the offer details", "OFFER_REVIEW", 5, "LOW", "NOT_STARTED", -1, "Emily Lawson", -1),
        new Extra("Refresh my skills section", "RESUME_PROFILE", -5, "MEDIUM", "DONE", 1, null, -1),
        new Extra("Send availability to my marketer", "COMMUNICATION", -4, "MEDIUM", "DONE", 2, "Michael Park", -1),
        new Extra("Practice common interview questions", "INTERVIEW_PREPARATION", -6, "HIGH", "DONE", 4, null, 1),
        new Extra("Upload updated certifications", "RESUME_PROFILE", -12, "LOW", "DONE", 9, null, -1)
    );

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final RequirementMatchRepository matches;
    private final CwsTaskAccessRepository tasks;
    private final CwsTaskDetailRepository details;

    public ConsultantWsTasksDemoSeeder(
        OrganizationRepository orgs, ConsultantProfileRepository consultants, RequirementMatchRepository matches, CwsTaskAccessRepository tasks, CwsTaskDetailRepository details
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.matches = matches;
        this.tasks = tasks;
        this.details = details;
    }

    @Transactional
    public int seed() {
        int made = 0;
        Instant now = Instant.now();
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            for (ConsultantProfile c : consultants.findByOrgId(org.getId())) {
                if (c.getMemberId() == null || details.countByOrgIdAndConsultantId(org.getId(), c.getId()) > 0) continue;
                List<Long> jobs = matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org.getId(), c.getId()).stream().map(RequirementMatch::getRequirementId).distinct().toList();
                List<CwsTask> mine = tasks.findByOrgIdAndConsultantId(org.getId(), c.getId());
                for (Detail d : EXISTING) {
                    CwsTask t = mine.stream().filter(x -> d.title().equals(x.getTitle())).findFirst().orElse(null);
                    if (t == null) continue;
                    save(org.getId(), c.getId(), t.getId(), d.type(), d.by(), job(jobs, d.job()), now);
                    made++;
                }
                for (Extra e : EXTRAS) {
                    CwsTask t = new CwsTask();
                    t.setOrgId(org.getId());
                    t.setConsultantId(c.getId());
                    t.setTitle(e.title());
                    t.setDueOn(today.plusDays(e.due()));
                    t.setPriority(e.priority());
                    t.setStatus(e.status());
                    Instant created = now.minus(Duration.ofDays(Math.max(3, 3 - e.due())));
                    t.setCreatedAt(created);
                    t.setUpdatedAt(now);
                    if (e.doneAgo() >= 0) t.setCompletedAt(now.minus(Duration.ofDays(e.doneAgo())).minus(Duration.ofHours(1)));
                    t = tasks.save(t);
                    save(org.getId(), c.getId(), t.getId(), e.type(), e.by(), job(jobs, e.job()), now);
                    made += 2;
                }
            }
        }
        if (made > 0) LOG.info("Consultant workspace Tasks demo rows seeded: {}", made);
        return made;
    }

    private static Long job(List<Long> jobs, int index) {
        return index >= 0 && index < jobs.size() ? jobs.get(index) : null;
    }

    private void save(Long org, Long consultant, Long taskId, String type, String by, Long requirementId, Instant now) {
        CwsTaskDetail d = new CwsTaskDetail();
        d.setOrgId(org);
        d.setConsultantId(consultant);
        d.setTaskId(taskId);
        d.setTaskType(type);
        d.setRequirementId(requirementId);
        if (by != null) {
            d.setAssignedByLabel(by);
            d.setSampleData(true);
        }
        d.setCreatedAt(now);
        d.setUpdatedAt(now);
        details.save(d);
    }
}
