package com.dossier.api.service;

import java.time.Instant;

/**
 * An interview was created, moved or called off because of a mail in the person's own Gmail. Carries a time and a kind and NOTHING from the mail: no
 * sender, subject, body or link. The consultant workspace listens to it to show the same interview on the organization's Interviews page when the
 * consultant shares in full (docs/enterprise-v2/18-consultant-inbox.md, the privacy wall).
 */
public record InboxInterviewChanged(Long userId, Long applicationId, Long interviewId, Instant startsAt, Instant endsAt, String kind, boolean cancelled) {}
