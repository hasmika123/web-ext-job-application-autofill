package com.dossier.api.service.inbox;

/**
 * The seam between reading a mail ({@link InboxParser} produces a {@link MailEvent}) and acting on it. The
 * parser asks {@link #decide} once per classified mail and does exactly what the answer says: apply the
 * status or timeline change, hold the mail for a person, or leave it alone. Replace the default by declaring
 * another bean marked {@code @Primary} (the safety layer: confirm before a rejection, undo, a review list).
 */
public interface InboxDecisionPolicy {
    /** Hold reasons stored on the message. */
    String HOLD_AMBIGUOUS = "AMBIGUOUS";
    String HOLD_LOW_CONFIDENCE = "LOW_CONFIDENCE";

    enum Outcome {
        /** Do what the mail says: move the status, write the timeline row, create or change the interview. */
        APPLY,
        /** Keep the mail linked to its candidates and change nothing until a person decides. */
        HOLD,
        /** Nothing to do with a tracked application (or too weak to bother anyone). */
        IGNORE,
    }

    record Decision(Outcome outcome, String holdReason) {
        public static final Decision APPLY = new Decision(Outcome.APPLY, null);
        public static final Decision IGNORE = new Decision(Outcome.IGNORE, null);

        public static Decision hold(String reason) {
            return new Decision(Outcome.HOLD, reason);
        }
    }

    Decision decide(MailEvent event);
}
