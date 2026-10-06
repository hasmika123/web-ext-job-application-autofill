package com.dossier.api.service.jobs;

import java.time.Instant;
import java.util.List;

/**
 * Reads one public job board (Phase 13.6a). The one seam between the nightly read and the network,
 * so tests swap in a fake.
 */
public interface JobBoardClient {
    /**
     * @param total every open job on the board (for the admin view)
     * @param fresh the ones first published at or after {@code since}, with descriptions
     */
    record Result(int total, List<FetchedPosting> fresh) {}

    /** The board answered with something other than a job list — a 404 for a gone board, a 5xx… */
    class BoardException extends Exception {

        private final boolean gone;

        public BoardException(String message, boolean gone) {
            super(message);
            this.gone = gone;
        }

        /** The board doesn't exist (any more): a 404. Still retried a few nights before switching off. */
        public boolean isGone() {
            return gone;
        }
    }

    Result fetch(String ats, String boardToken, String companyName, Instant since) throws BoardException;
}
