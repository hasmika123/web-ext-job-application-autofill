package com.dossier.api.web.rest.ent.mgmt;

import com.dossier.api.service.ent.mgmt.MgmtPipelineDTO;
import com.dossier.api.service.ent.mgmt.MgmtPipelineService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Marketing Manager's Pipeline board: a read of the team's opportunities in the board's columns and the summary strip. No route moves a card; nothing here
 * sends or submits anything. A caller without the key, a member of another organization and a marketer or consultant outside the team all get the generic 404.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mgmt/pipeline")
@Tag(name = "mgmt-pipeline", description = "Marketing Manager: the pipeline board of the team and its summary strip. Read only.")
public class MgmtPipelineResource {

    private final MgmtPipelineService service;

    public MgmtPipelineResource(MgmtPipelineService service) {
        this.service = service;
    }

    @Operation(
        summary = "The pipeline board of the team",
        description = "pipeline.view at TEAM scope or wider. The opportunities of the consultants the team's marketers carry, in the columns ASSIGNED, VIEWED, INTERESTED, NEEDS_INFO, APPLIED, INTERVIEW, OFFER and CLOSED " +
            "(an applied opportunity is in INTERVIEW or OFFER once the consultant's application for that job has got that far). Each card: consultant, job, client, the marketer who owns it, its age, " +
            "the time of its last activity and stale (an open card with no activity for org.pipeline.stalled_days). Query: marketer (a member of the team), consultant, client, stale=true, " +
            "range (30 or 90 days, default 30: the right-hand columns show what changed within it), page (from 0), size (1 to 200, default 50). Columns carry their full count; the cards are the page's. " +
            "X-Total-Count is the number of cards under the filters. A marketer or consultant outside the team: the generic 404. No card can be moved from here."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<MgmtPipelineDTO.Board> board(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "marketer", required = false) Long marketer,
        @RequestParam(name = "consultant", required = false) Long consultant,
        @RequestParam(name = "client", required = false) Long client,
        @RequestParam(name = "stale", required = false) Boolean stale,
        @RequestParam(name = "range", required = false) String range,
        @RequestParam(name = "page", defaultValue = "0") int page,
        @RequestParam(name = "size", defaultValue = "50") int size
    ) {
        MgmtPipelineDTO.Board board = service.board(me, new MgmtPipelineService.Filter(marketer, consultant, client, Boolean.TRUE.equals(stale), range), page, size);
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(board.total())).body(board);
    }

    @Operation(
        summary = "The summary strip of the pipeline",
        description = "pipeline.view at TEAM scope or wider. A count per column (range as on the board), how many open cards are stale, and for the last 30 and the last 90 days the funnel of what happened: " +
            "assigned, interested, recorded as submitted by the consultant, interviews scheduled and offers, each with its conversion from the step before (counts of events in the window, not a cohort)."
    )
    @GetMapping("/summary")
    @OrgPermissionRequired
    public MgmtPipelineDTO.Summary summary(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "range", required = false) String range
    ) {
        return service.summary(me, range);
    }
}
