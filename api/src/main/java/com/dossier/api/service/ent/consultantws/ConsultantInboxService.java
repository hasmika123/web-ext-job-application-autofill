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
import com.dossier.api.service.inbox.InboxReviewService;
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
    private final InboxReviewService review;

    public ConsultantInboxService(
        ConsultantHomeService gate,
        AuthorizationService authorization,
        InboxService inbox,
        InboxMailService mail,
        InboxEntitlement entitlement,
        InboxMessageRepository messages,
        ApplicationRepository applications,
        ImapGateway imap,
        DemoGuard demoGuard,
        InboxReviewService review
    ) {
        this.review = review;
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
        // The organization no longer grants it (an enterprise account has no other ground): the connection is stopped. The poller marks it too; this is the live truth.
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
        // One row per company, the newest mail (the list is newest first): accepting it folds in the company's older mails, so a second mail from
        // the same company (an availability request, then the confirmed invitation) is one suggestion, not two.
        Set<String> seen = new HashSet<>();
        return mail
            .suggestions()
            .stream()
            .filter(s -> {
                String key = com.dossier.api.service.ApplicationKeys.company(s.company());
                return key.isEmpty() || seen.add(key);
            })
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

    // ---- inbox safety (what the inbox held, undo, the rejection switch): the consultant's own, answered by the same service as the personal app ----

    @Transactional(readOnly = true)
    public InboxReviewService.ReviewList review(OrgMembership me) {
        requireSelf(me);
        return review.list(me.userId());
    }

    public InboxReviewService.Applied acceptHold(OrgMembership me, Long holdId, Long applicationId) {
        requireSelf(me);
        return review.accept(me.userId(), holdId, applicationId);
    }

    public void dismissHold(OrgMembership me, Long holdId) {
        requireSelf(me);
        review.dismiss(me.userId(), holdId);
    }

    public InboxReviewService.Applied undoChange(OrgMembership me, Long applicationId, Long eventId) {
        requireSelf(me);
        return review.undo(me.userId(), applicationId, eventId);
    }

    @Transactional(readOnly = true)
    public InboxReviewService.Settings reviewSettings(OrgMembership me) {
        requireSelf(me);
        return review.settings(me.userId());
    }

    public InboxReviewService.Settings setReviewSettings(OrgMembership me, boolean applyRejectionsAutomatically) {
        requireSelf(me);
        return review.setSettings(me.userId(), applyRejectionsAutomatically);
    }

    @Transactional(readOnly = true)
    public List<Update> updates(OrgMembership me) {
        requireSelf(me);
        return updates(me.userId());
    }

    /**
     * The applications the mail is tracking, newest mail first: company, role, the application's CURRENT stage and how the newest matched mail was read
     * (for example "Interview invite"). One row per application, only mail that arrived (not sent mail). Never a subject, sender or snippet.
     */
    private List<Update> updates(Long userId) {
        List<InboxMessage> matched = messages
            .findByUserIdOrderBySentAtDesc(userId)
            .stream()
            .filter(m -> InboxMessage.IN.equals(m.getDirection()) && m.getApplicationId() != null && m.getCategory() != null)
            .limit(200)
            .toList();
        if (matched.isEmpty()) return List.of();
        Map<Long, Application> byId = applications.findByUserId(userId).stream().collect(Collectors.toMap(Application::getId, a -> a, (a, b) -> a));
        List<Update> out = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (InboxMessage m : matched) {
            Application a = byId.get(m.getApplicationId());
            if (a == null || Boolean.TRUE.equals(a.getArchived()) || a.getStatus() == null || !seen.add(a.getId())) continue; // the newest mail speaks for the application
            String stage = a.getStatus().name();
            out.add(new Update(a.getId(), a.getCompany(), a.getRoleTitle(), stage, label(stage), reading(m.getCategory()), m.getSentAt(), "INBOX"));
            if (out.size() >= 40) break;
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
