package com.dossier.api.service.ent.mkt;

import com.dossier.api.service.org.OrgNotFoundException;
import org.springframework.stereotype.Component;

/**
 * THE seam for "may this marketer see this part of this consultant" (decisions O5 / O6, docs/enterprise-v2/19b).
 *
 * <p>O5 (today): an ASSIGNED marketer sees ALL of that consultant's resumes and applications, so {@link #allows} is true for every consultant the
 * caller's {@link MktScope.View} reaches (the assignment itself, or an ORG-scope holder) and false for everyone else. O6 (later, not built): the Org Admin
 * ticks per assignment which {@link Area}s the marketer may see; when that table exists, ONLY the body of {@link #allows} changes, and every caller
 * (the talent overview, the act-for save) already passes the area it reads or writes. A refusal is the generic 404 ({@link #require}), never a 403.
 */
@Component
public class MarketerAccess {

    /** The parts of a consultant the visibility decision (O6) can open or close separately. */
    public enum Area {
        PROFILE,
        RESUMES,
        APPLICATIONS,
        INTERVIEWS,
        PLACEMENT
    }

    /** True when the caller (resolved through {@link MktScope}) may see {@code area} of the consultant {@code consultantProfileId}. */
    public boolean allows(MktScope.View caller, Long consultantProfileId, Area area) {
        return caller != null && consultantProfileId != null && area != null && caller.sees(consultantProfileId);
    }

    /** Same question, answered as the generic 404 when the answer is no. */
    public void require(MktScope.View caller, Long consultantProfileId, Area area) {
        if (!allows(caller, consultantProfileId, area)) throw new OrgNotFoundException();
    }
}
