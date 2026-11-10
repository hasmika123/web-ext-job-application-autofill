package com.dossier.api.service.ent.placements;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import java.time.LocalDate;
import org.springframework.stereotype.Component;

/**
 * Keeps the consultant's availability status consistent with their placement (CON-45: "On a project" while placed, "On notice" once notice is given,
 * "Available" again once it ended). It only moves between the three placement-driven states: a consultant who set themselves Not available stays that way,
 * and nothing here ever writes anything but the status and the available-from day. Joins the caller's transaction.
 */
@Component
public class PlacementAvailabilitySync {

    static final String AVAILABLE = "AVAILABLE";
    static final String ON_PROJECT = "ON_PROJECT";
    static final String NOTICE = "NOTICE";

    private final ConsultantProfileRepository consultants;

    public PlacementAvailabilitySync(ConsultantProfileRepository consultants) {
        this.consultants = consultants;
    }

    /** The placement is working now. */
    public void onStarted(Long orgId, Long consultantId, LocalDate today) {
        move(orgId, consultantId, ON_PROJECT, null, today, AVAILABLE, NOTICE);
    }

    /** Notice was given: still working until {@code endDate}, free the day after. */
    public void onNotice(Long orgId, Long consultantId, LocalDate endDate, LocalDate today) {
        move(orgId, consultantId, NOTICE, endDate.plusDays(1), today, ON_PROJECT, AVAILABLE);
    }

    /** The placement ended (completed or terminated). */
    public void onEnded(Long orgId, Long consultantId, LocalDate today) {
        move(orgId, consultantId, AVAILABLE, null, today, ON_PROJECT, NOTICE);
    }

    private void move(Long orgId, Long consultantId, String to, LocalDate availableFrom, LocalDate today, String... from) {
        ConsultantProfile c = consultants.findByOrgIdAndId(orgId, consultantId).orElse(null);
        if (c == null) return;
        boolean allowed = false;
        for (String f : from) if (f.equals(c.getAvailabilityStatus())) allowed = true;
        if (!allowed) return;
        if (!to.equals(c.getAvailabilityStatus())) c.setAvailabilitySince(today);
        c.setAvailabilityStatus(to);
        c.setAvailableFrom(availableFrom);
        consultants.saveAndFlush(c);
    }
}
