package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import com.dossier.api.web.rest.org.OrgFixtures;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.11 {@code PersonalSubscriptionUnchangedIT} E15, retirement half (docs/subscriptions/11 section 8, decision O4): a retirement of a personal plan never touches an enterprise
 * account, never writes to one and never shows one a page; the two worlds do not meet. (The organization half, an org retirement leaving personal subscriptions alone, arrives
 * with K10.7 and the enterprise plan layer.)
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class RetirementWorldsIT extends RetirementItSupport {

    @Autowired private OrganizationRepository orgs;

    private User enterpriseAccount() {
        String s = UUID.randomUUID().toString().substring(0, 8);
        Organization acme = new OrgFixtures(users, orgs, null).org("rw-" + s, OrgStatus.ACTIVE);
        User u = new User();
        u.setLogin("ent#" + acme.getId() + "#" + s);
        u.setPassword("x".repeat(60));
        u.setActivated(true);
        u.setEmail("ent." + s + "@example.test");
        u.setLangKey("en");
        u.setOrgId(acme.getId());
        return users.saveAndFlush(u);
    }

    @Test
    void aStrayRowOfAnEnterpriseAccountIsNeverCountedNoticedOrMoved() {
        User ent = enterpriseAccount();
        Subscription stray = RetirementFixtures.subscriberFor(ent, subscriptions, plan.versionId(), "MONTH", "active", 40, false, true);
        Subscription personal = monthly(40);
        var before = subRow(stray.getId());

        RetirementDTO r = startRetirement("FREE");

        assertThat(r.impact().subscribers()).as("only the personal subscriber is affected").isEqualTo(1);
        assertThat(itemRepo.findByRetirementIdAndSubscriptionId(r.id(), stray.getId())).isEmpty();
        Instant date = item(r, personal).getRetireEffectiveAt();
        noticeJob.run(date.minus(59, ChronoUnit.DAYS));
        job.run(date.plus(1, ChronoUnit.HOURS));
        assertThat(db().queryForObject("select count(*) from billing_notice where user_id = ?", Integer.class, ent.getId())).isZero();
        assertThat(db().queryForObject("select count(*) from service_lock where user_id = ?", Integer.class, ent.getId())).isZero();
        assertThat(subRow(stray.getId())).as("the enterprise account's row is untouched").isEqualTo(before);
        assertThat(mail.sent).allSatisfy(m -> assertThat(m.getAllRecipients()[0].toString()).isNotEqualTo(ent.getEmail()));
    }

    @Test
    void anEnterpriseAccountGetsTheGeneric404OnEveryRetirementRoute() {
        User ent = enterpriseAccount();
        RetirementFixtures.subscriberFor(ent, subscriptions, plan.versionId(), "MONTH", "active", 40, false, true);
        // A personal subscriber keeps the retirement live. With the stray row as the only holder the retirement would have nothing to do and try to retire the plan at once,
        // which the retire guard refuses (the plan is still referenced): that refusal is the K2.4 invariant, not what this test is about.
        monthly(40);
        startRetirement("FREE");
        assertThatThrownBy(() -> choices.me(ent.getLogin())).isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getStatus()).isEqualTo(404));
        assertThatThrownBy(() -> choices.choose(ent.getLogin(), UUID.randomUUID().toString(), new com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.ChoiceRequest("LATER", null, null, null, null)))
            .isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getStatus()).isEqualTo(404));
    }
}
