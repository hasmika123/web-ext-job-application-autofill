package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.CreateRequest;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.RuleRequest;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.RuleRow;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.StreamRow;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.UpdateRequest;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.View;
import com.dossier.api.service.ent.mkt.streams.MktStreamsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Marketing workspace's Job Streams page. Everything goes through {@code MktScope.resolve(me, "matches.run")} inside the service:
 * a caller without the permission, a non-member, or an organization outside the flags gets the generic 404. Writes only RECORD stream
 * configuration and rule settings; nothing here syncs from an external site and nothing submits anything for a consultant (E1).
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/streams")
@Tag(name = "mkt-streams", description = "Marketing workspace: job-source streams, sync activity, openings captured, alerts and stream rules.")
public class MktStreamsResource {

    private final MktStreamsService service;

    public MktStreamsResource(MktStreamsService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Job Streams board (one call)",
        description = "{kpis, streams:{items,total,page,size}, filters, activity, chart, alerts, rules}. Query: q, source, status (ACTIVE|PAUSED|ERROR), client, "
            + "showInactive (default false: paused streams are hidden), page, size (cap 100), sort (created|source|status|lastSync|openings, '-' prefix = descending), days (7|14, chart). matches.run required; 404 otherwise."
    )
    @GetMapping
    @OrgPermissionRequired
    public View get(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String source,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String client,
        @RequestParam(defaultValue = "false") boolean showInactive,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "25") int size,
        @RequestParam(required = false) String sort,
        @RequestParam(defaultValue = "7") int days
    ) {
        return service.get(me, new MktStreamsService.Query(q, source, status, client, showInactive, page, size, sort, days));
    }

    @Operation(summary = "Add a job stream", description = "Records the configuration (source name, schedule, keywords, client scope). It does not connect to or scrape any site. matches.run.")
    @PostMapping
    @OrgPermissionRequired
    @ResponseStatus(HttpStatus.CREATED)
    public StreamRow create(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @Valid @RequestBody CreateRequest body) {
        return service.create(me, body);
    }

    @Operation(summary = "Configure a stream", description = "Partial update of name, description, schedule, keywords, client scope. Unknown or other-tenant id: 404. matches.run.")
    @PatchMapping("/{streamId}")
    @OrgPermissionRequired
    public StreamRow update(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long streamId, @Valid @RequestBody UpdateRequest body) {
        return service.update(me, streamId, body);
    }

    @Operation(summary = "Pause a stream", description = "Marks the stream paused (hidden unless Show Inactive). matches.run.")
    @PostMapping("/{streamId}/pause")
    @OrgPermissionRequired
    public StreamRow pause(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long streamId) {
        return service.pause(me, streamId);
    }

    @Operation(summary = "Resume a stream", description = "Marks a paused stream active again. matches.run.")
    @PostMapping("/{streamId}/resume")
    @OrgPermissionRequired
    public StreamRow resume(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long streamId) {
        return service.resume(me, streamId);
    }

    @Operation(summary = "Toggle or edit a stream rule", description = "ruleKey: DEFAULT_KEYWORDS | CLIENT_MAPPING | DUPLICATE_DETECTION | AUTO_PUBLISH. Body {enabled?, value?}. matches.run.")
    @PatchMapping("/rules/{ruleKey}")
    @OrgPermissionRequired
    public RuleRow updateRule(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable String ruleKey, @Valid @RequestBody RuleRequest body) {
        return service.updateRule(me, ruleKey, body);
    }
}
