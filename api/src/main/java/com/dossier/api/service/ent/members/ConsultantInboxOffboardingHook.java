package com.dossier.api.service.ent.members;

import com.dossier.api.domain.User;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.dto.ent.MemberActionDTO;
import com.dossier.api.service.inbox.InboxService;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Offboarding step 450 (ent-inbox, docs/enterprise-v2/18-consultant-inbox.md): a consultant's own Gmail connection that was made THROUGH this
 * organization (their license granted {@code inbox.monitoring}) is forgotten when they leave: the encrypted app password, the folder positions and
 * every message read. A connection the person made on their personal plan is theirs and is never touched.
 *
 * <p>The organization never saw any of it, so the preview says nothing about it either: an administrator planning an offboarding learns no more
 * about a person's mailbox than the fact that a step ran (the audit row lists the hook keys, as for every step).
 */
@Component
public class ConsultantInboxOffboardingHook implements OffboardingHook {

    /** Between consent (300) and resume links (400)'s neighbours: it needs nothing from them. */
    public static final int ORDER_INBOX = 450;

    private final UserRepository users;
    private final InboxService inbox;

    public ConsultantInboxOffboardingHook(UserRepository users, InboxService inbox) {
        this.users = users;
        this.inbox = inbox;
    }

    @Override
    public int getOrder() {
        return ORDER_INBOX;
    }

    @Override
    public String key() {
        return "inbox";
    }

    @Override
    public List<MemberActionDTO.HookLine> preview(Long orgId, Long memberId) {
        return List.of(); // deliberately empty: nothing about a mailbox is shown to the organization
    }

    @Override
    public void apply(Context context) {
        if (context.memberLogin() == null) return;
        users.findOneByLogin(context.memberLogin()).map(User::getId).ifPresent(userId -> inbox.purgeConnectedVia(userId, context.orgId()));
    }
}
