package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.inbox.DemoImapGateway;
import io.swagger.v3.oas.annotations.Operation;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Demo stack only: the controls of the sample mailbox's live-arrival mode ({@code dossier.demo.inbox-staged=true}). A presenter "sends" a held-back
 * group of sample mails (an interview invitation, a rejection) and the consultant's Inbox reads it on its next check. Platform admin only, and a 404
 * whenever the sample mailbox is not running (no demo, a real Gmail, or production, where the sample mailbox can never exist).
 */
@RestController
@RequestMapping("/api/admin/demo/inbox")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminDemoInboxResource {

    private final ObjectProvider<DemoImapGateway> sample;

    public AdminDemoInboxResource(ObjectProvider<DemoImapGateway> sample) {
        this.sample = sample;
    }

    @Operation(summary = "Demo mailbox: what it holds and what is held back")
    @GetMapping
    public ResponseEntity<Map<String, Object>> view() {
        DemoImapGateway g = sample.getIfAvailable();
        if (g == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        return ResponseEntity.ok(Map.of("address", g.demoAddress(), "staging", g.isStaging(), "groups", g.stagedGroups(), "inbox", g.inboxView()));
    }

    @Operation(summary = "Demo mailbox: send a held-back group of mails now")
    @PostMapping("/{group}/deliver")
    public ResponseEntity<Map<String, Object>> deliver(@PathVariable("group") String group) {
        DemoImapGateway g = sample.getIfAvailable();
        if (g == null || !g.deliver(group)) return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        return ResponseEntity.ok(Map.of("delivered", group, "groups", g.stagedGroups()));
    }

    @Operation(summary = "Demo mailbox: hold every group back again")
    @PostMapping("/reset")
    public ResponseEntity<List<DemoImapGateway.StagedGroup>> reset() {
        DemoImapGateway g = sample.getIfAvailable();
        if (g == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        g.resetDeliveries();
        return ResponseEntity.ok(g.stagedGroups());
    }
}
