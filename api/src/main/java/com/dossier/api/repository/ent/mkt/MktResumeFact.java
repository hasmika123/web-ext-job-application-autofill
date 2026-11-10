package com.dossier.api.repository.ent.mkt;

import java.time.Instant;

/** The few facts of an org resume the "Resume Status" column and the assign gate need. Pure data. */
public record MktResumeFact(Long consultantId, String approvalStatus, boolean primaryForOrg, Instant updatedAt) {}
