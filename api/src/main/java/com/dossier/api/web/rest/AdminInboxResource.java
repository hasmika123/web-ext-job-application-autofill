package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.inbox.InboxStuckService;
import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Platform admin, read-only: inboxes that are not being read. {@code ROLE_ADMIN} only; account ids, status and the last poll time, never an address or
 * any mail. A platform route, not an organization one.
 */
@RestController
@RequestMapping("/api/admin/inbox")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminInboxResource {

    private final InboxStuckService stuck;

    public AdminInboxResource(InboxStuckService stuck) {
        this.stuck = stuck;
    }

    /** Needs reconnecting, or not polled for more than two poll intervals. */
    @GetMapping("/stuck")
    public Map<String, Object> stuck() {
        List<InboxStuckService.Stuck> items = stuck.stuck();
        return Map.of("items", items, "count", items.size());
    }
}
