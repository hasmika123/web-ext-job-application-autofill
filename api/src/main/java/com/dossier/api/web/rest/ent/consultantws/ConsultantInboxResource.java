package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantInboxDTO;
import com.dossier.api.service.ent.consultantws.ConsultantInboxService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consultant workspace Inbox: the signed-in consultant's OWN Gmail (ent-inbox, docs/enterprise-v2/18-consultant-inbox.md). Every route answers the
 * consultant about their own mailbox and is the generic 404 for anyone else in the organization (administrators, marketers, account managers, the
 * platform admin), so the organization can never read credentials, subjects, senders or bodies through it. The app password is accepted by
 * {@code POST} only, checked against Gmail, stored encrypted and never returned. Connecting needs the organization license to include
 * {@code inbox.monitoring} (402 {@code FEATURE_NOT_LICENSED} otherwise).
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/inbox")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantInboxResource {

    private final ConsultantInboxService service;

    public ConsultantInboxResource(ConsultantInboxService service) {
        this.service = service;
    }

    @Operation(summary = "Inbox page", description = "The connection (never its password), what the mail suggests and the applications it is tracking.")
    @GetMapping
    @OrgPermissionRequired
    public ConsultantInboxDTO.Page page(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.page(me);
    }

    @Operation(summary = "Connect a Gmail with an app password", description = "Checked against Gmail before anything is stored. 402 FEATURE_NOT_LICENSED when the organization license lacks inbox tracking; 400/422/429/502/503 as for the personal inbox.")
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<?> connect(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantInboxDTO.ConnectRequest body
    ) {
        return service.connect(me, body);
    }

    @Operation(summary = "Disconnect the inbox", description = "Deletes the connection, the encrypted password and every message read from it.")
    @DeleteMapping
    @OrgPermissionRequired
    public Map<String, Object> disconnect(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        service.disconnect(me);
        return Map.of("ok", true);
    }

    @Operation(summary = "Switch emails about interviews and offers on or off")
    @PutMapping("/notify")
    @OrgPermissionRequired
    public ConsultantInboxDTO.View notify(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantInboxDTO.NotifyRequest body
    ) {
        return service.setNotify(me, body == null ? null : body.email());
    }

    @Operation(summary = "Jobs the mail shows that the board does not track")
    @GetMapping("/suggestions")
    @OrgPermissionRequired
    public List<ConsultantInboxDTO.Suggestion> suggestions(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.suggestions(me);
    }

    @Operation(summary = "Add a suggested job to the board")
    @PostMapping("/suggestions/{suggestionId}/accept")
    @OrgPermissionRequired
    public Map<String, Object> accept(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long suggestionId,
        @RequestBody(required = false) ConsultantInboxDTO.AcceptRequest body
    ) {
        return Map.of("applicationId", service.accept(me, suggestionId, body));
    }

    @Operation(summary = "Hide a suggested job")
    @PostMapping("/suggestions/{suggestionId}/dismiss")
    @OrgPermissionRequired
    public Map<String, Object> dismiss(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long suggestionId) {
        service.dismiss(me, suggestionId);
        return Map.of("ok", true);
    }

    @Operation(summary = "Applications the mail is tracking", description = "Company, role, current stage and how the newest matched mail was read; always from the consultant's own inbox.")
    @GetMapping("/updates")
    @OrgPermissionRequired
    public List<ConsultantInboxDTO.Update> updates(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.updates(me);
    }
}
