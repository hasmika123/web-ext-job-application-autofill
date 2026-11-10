package com.dossier.api.service;

import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.enumeration.ApplicationStatus;

/**
 * Published by {@link ApplicationEventService#record} right after an {@code application_event} is saved, so other parts of the system can follow the
 * person's own tracker without {@code ApplicationSyncService} knowing about them (docs/enterprise-v2/60-job-phase1-contract.md section 5). Delivered
 * to {@code @TransactionalEventListener(AFTER_COMMIT)} listeners: they only ever see a write that committed, and can never fail it.
 *
 * <p>Carries ids and facts only; a listener reads the application itself. {@code userId} is the owner (null only for an application without one).
 *
 * @param kind       the event kind ({@code CREATED}, {@code STATUS}, {@code NOTE}, ...)
 * @param fromStatus the status before (null for a creation or a non-status event)
 * @param toStatus   the status after: the first status for {@code CREATED}, the new one for {@code STATUS}, null for events that do not carry one
 * @param source     where the write came from ({@code EXTENSION}, {@code WEB}, {@code INBOX}, {@code SYSTEM}, {@code ASSISTANT})
 */
public record ApplicationEventRecorded(Long userId, Long applicationId, String kind, ApplicationStatus fromStatus, ApplicationStatus toStatus, String source) {

    /** True for the two kinds that can move an application toward or away from "applied"; everything else (notes, interviews, ...) is of no interest to a linker. */
    public boolean relevant() {
        return userId != null && applicationId != null && toStatus != null && (ApplicationEvent.CREATED.equals(kind) || ApplicationEvent.STATUS.equals(kind));
    }
}
