package com.dossier.api.service.retirement.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/** The admin's view of a retirement's notices (docs/subscriptions/11 section 4; story K10.3). */
public final class NoticeDTOs {

    private NoticeDTOs() {}

    /** One row of the notice ledger: what was sent to whom and when. {@code login} is the admin's alone; the body of an e-mail is never stored. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NoticeDTO(Long id, Long itemId, Long subscriptionId, String login, String kind, String channels, String subject, String status, Instant createdAt) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NoticePage(List<NoticeDTO> items, long total, int page, int size) {}

    /** A notice as a subscriber would read it. {@code sample} is true when no real subscriber was named (invented numbers). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NoticePreviewDTO(
        String subject,
        String intro,
        String suggest,
        String defaultOutcome,
        String cancel,
        String message,
        String lastDay,
        Instant effectiveAt,
        String effectiveDate,
        boolean sample
    ) {}

    public record ResendRequest(String reason) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ResendResult(boolean sent, Integer days, Long noticeId) {}
}
