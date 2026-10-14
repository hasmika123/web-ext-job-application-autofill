package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.consultantws.ConsultantInboxDTO.AcceptRequest;
import com.dossier.api.service.ent.consultantws.ConsultantInboxDTO.ConnectRequest;
import com.dossier.api.service.ent.consultantws.ConsultantInboxDTO.Page;
import com.dossier.api.service.ent.consultantws.ConsultantInboxDTO.Suggestion;
import com.dossier.api.service.ent.consultantws.ConsultantInboxDTO.Update;
import com.dossier.api.service.ent.consultantws.ConsultantInboxDTO.View;
import com.dossier.api.service.inbox.ImapGateway;
import com.dossier.api.service.inbox.InboxEntitlement;
import com.dossier.api.service.inbox.InboxMailService;
import com.dossier.api.service.inbox.InboxService;
import com.dossier.api.service.inbox.MailClassifier;
import com.dossier.api.service.org.OrgMembership;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The consultant's own Gmail inbox inside the organization workspace (ent-inbox, docs/enterprise-v2/18-consultant-inbox.md): the SAME connection,
 * poller, parser and board as the personal inbox ({@link InboxService}, {@link InboxMailService}), reached through the consultant workspace.
 *
 * <p><b>The privacy wall.</b> Everything here is answered to the signed-in consultant about their own mailbox. The gate is
 * {@link ConsultantHomeService#requireSelf} plus {@value #PERMISSION}: an administrator, a marketer, an account manager or the platform admin has no
 * route to any of it (the generic 404), and nothing in this class reads or writes an organization table. The organization sees one thing only: the
 * stage an application reached, through the existing status mirror ({@code PipelineApplicationLinker}), tagged with the source INBOX and never with
 * a subject, sender, snippet or address. The organization is taken from the path, which the interceptor has already checked against the host the
 * request arrived on; it is never read from a body.
 *
 * <p><b>Credential safety</b> is the personal inbox's, unchanged: AES-256-GCM {@code SecretBox}, the password is never returned, logged, audited or
 * exported, five connect attempts per quarter hour, a rejected password stops reading, disconnect purges the connection and every message.
 */
@Service
public class ConsultantInboxService {

    public static final String PERMISSION = "applications.manage";

    private final ConsultantHomeService gate;
    private final AuthorizationService authorization;
    private final InboxService inbox;
    private final InboxMailService mail;
    private final InboxEntitlement entitlement;
    private final InboxMessageRepository messages;
    private final ApplicationRepository applications;
    private final ImapGateway imap;
    private final DemoGuard demoGuard;

    public ConsultantInboxService(
        ConsultantHomeService gate,
        AuthorizationService authorization,
        InboxService inbox,
        InboxMailService mail,
        InboxEntitlement entitlement,
        InboxMessageRepository messages,
        ApplicationRepository applications,
        ImapGateway imap,
        DemoGuard demoGuard
    ) {
        this.gate = gate;
        this.authorization = authorization;
        this.inbox = inbox;
        this.mail = mail;
        this.entitlement = entitlement;
        this.messages = messages;
        this.applications = applications;
        this.imap = imap;
        this.demoGuard = demoGuard;
    }

    /** The caller must be a consultant of this organization who may manage their applications; anything else is the generic 404. */
    private void requireSelf(OrgMembership me) {
        gate.requireSelf(me);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(PERMISSION), Beneficiary.SELF, null, AuthzOperation.READ).withActor(me));
    }

    @Transactional(readOnly = true)
    public Page page(OrgMembership me) {
        requireSelf(me);
        View view = viewOf(me);
        boolean live = view.connected() && view.entitled();
        return new Page(view, live ? suggestions() : List.of(), view.connected() ? updates(me.userId()) : List.of());
    }

    @Transactional(readOnly = true)
    public View view(OrgMembership me) {
        requireSelf(me);
        return viewOf(me);
    }

    private View viewOf(OrgMembership me) {
        boolean orgGrants = entitlement.orgGrants(me.orgId(), me.userId());
        InboxService.View v = inbox.mine();
        if (!v.connected()) return new View(orgGrants, v.available(), false, null, null, null, null, null, null, 0, true, imap.isDemoSandbox(), imap.sandboxAddress());
        // The organization no longer grants it: unless their own plan does, the connection is stopped. The poller marks it too; this is the live truth.
        boolean entitled = orgGrants || entitlement.decide(me.userId(), me.login()).allowed();
        String status = v.status();
        String note = null;
        if (!entitled) {
            status = InboxConnection.NO_ENTITLEMENT;
            note = "Your organization no longer includes inbox tracking.";
        } else if (InboxConnection.NO_ENTITLEMENT.equals(status)) {
            status = InboxConnection.CONNECTED; // granted again; the poller picks it up on its next round
        }
        return new View(entitled, v.available(), true, v.address(), status, v.connectedAt(), v.lastCheckedAt(), v.lastError(), note, v.messages(), v.notifyEmail(), imap.isDemoSandbox(), imap.sandboxAddress());
    }

    /** Connect through this organization's license. The address and app password are checked against Gmail and kept only encrypted. */
    public ResponseEntity<?> connect(OrgMembership me, ConnectRequest body) {
        requireSelf(me);
        if (!imap.isDemoSandbox()) demoGuard.assertNotDemo(); // a shared demo account never reaches a real mailbox; the demo sandbox has none
        InboxService.ConnectResult r = inbox.connect(body == null ? null : body.address(), body == null ? null : body.appPassword(), me.orgId());
        if (r.refusal() != null) {
            return ResponseEntity.status(r.refusal().status()).body(Map.of("code", r.refusal().code(), "message", r.refusal().message()));
        }
        return ResponseEntity.ok(viewOf(me));
    }

    public void disconnect(OrgMembership me) {
        requireSelf(me);
        if (!imap.isDemoSandbox()) demoGuard.assertNotDemo();
        inbox.disconnect();
    }

    public View setNotify(OrgMembership me, Boolean email) {
        requireSelf(me);
        if (!inbox.mine().connected()) throw new ResponseStatusException(HttpStatus.CONFLICT, "No inbox connected");
        inbox.setNotifyEmail(email == null || email);
        return viewOf(me);
    }

    @Transactional(readOnly = true)
    public List<Suggestion> suggestions(OrgMembership me) {
        requireSelf(me);
        return suggestions();
    }

    private List<Suggestion> suggestions() {
        return mail
            .suggestions()
            .stream()
            .map(s -> new Suggestion(s.id(), s.company(), s.role(), s.category(), stageOf(s.category()).name(), s.subject(), s.fromName(), s.fromAddress(), s.sentAt()))
            .toList();
    }

    @Transactional
    public Long accept(OrgMembership me, Long id, AcceptRequest body) {
        requireSelf(me);
        return mail.accept(id, body == null ? null : body.company(), body == null ? null : body.roleTitle());
    }

    @Transactional
    public void dismiss(OrgMembership me, Long id) {
        requireSelf(me);
        mail.dismiss(id);
    }

    @Transactional(readOnly = true)
    public List<Update> updates(OrgMembership me) {
        requireSelf(me);
        return updates(me.userId());
    }

    /** Applications a mail moved (or created from a suggestion), newest first: company, role and stage only. */
    private List<Update> updates(Long userId) {
        List<InboxMessage> moved = messages
            .findByUserIdOrderBySentAtDesc(userId)
            .stream()
            .filter(m -> m.getStatusChange() != null && m.getApplicationId() != null)
            .limit(40)
            .toList();
        if (moved.isEmpty()) return List.of();
        Map<Long, Application> byId = applications.findByUserId(userId).stream().collect(Collectors.toMap(Application::getId, a -> a, (a, b) -> a));
        List<Update> out = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (InboxMessage m : moved) {
            Application a = byId.get(m.getApplicationId());
            if (a == null || !seen.add(a.getId())) continue; // one row per application: the newest mail that moved it
            String stage = m.getStatusChange();
            out.add(new Update(a.getId(), a.getCompany(), a.getRoleTitle(), stage, label(stage), reading(m.getCategory()), m.getSentAt(), "INBOX"));
        }
        return out;
    }

    static ApplicationStatus stageOf(String category) {
        if (category == null) return ApplicationStatus.SAVED;
        try {
            return switch (MailClassifier.Category.valueOf(category)) {
                case INTERVIEW -> ApplicationStatus.INTERVIEW;
                case OFFER -> ApplicationStatus.OFFER;
                case APPLIED, ASSESSMENT -> ApplicationStatus.APPLIED;
                default -> ApplicationStatus.SAVED;
            };
        } catch (IllegalArgumentException e) {
            return ApplicationStatus.SAVED;
        }
    }

    static String label(String status) {
        if (status == null) return "";
        return switch (status) {
            case "APPLIED" -> "Applied";
            case "IN_REVIEW" -> "Under review";
            case "INTERVIEW" -> "Interview";
            case "OFFER" -> "Offer";
            case "REJECTED" -> "Rejected";
            case "WITHDRAWN" -> "Withdrawn";
            default -> status.substring(0, 1) + status.substring(1).toLowerCase(Locale.ROOT);
        };
    }

    static String reading(String category) {
        if (category == null) return null;
        return switch (category) {
            case "APPLIED" -> "Confirmation";
            case "IN_REVIEW" -> "Under review";
            case "INTERVIEW" -> "Interview invite";
            case "ASSESSMENT" -> "Assessment";
            case "REJECTED" -> "Rejection";
            case "OFFER" -> "Offer";
            default -> null;
        };
    }
}
