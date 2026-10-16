package com.dossier.api.service;

import com.dossier.api.domain.User;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.thymeleaf.context.Context;
import org.thymeleaf.spring6.SpringTemplateEngine;
import tech.jhipster.config.JHipsterProperties;

/**
 * Service for sending emails asynchronously.
 * <p>
 * We use the {@link Async} annotation to send emails asynchronously.
 */
@Service
public class MailService {

    private static final Logger LOG = LoggerFactory.getLogger(MailService.class);

    private static final String USER = "user";

    private static final String BASE_URL = "baseUrl";

    private final JHipsterProperties jHipsterProperties;

    private final JavaMailSender javaMailSender;

    private final MessageSource messageSource;

    private final SpringTemplateEngine templateEngine;

    public MailService(
        JHipsterProperties jHipsterProperties,
        JavaMailSender javaMailSender,
        MessageSource messageSource,
        SpringTemplateEngine templateEngine
    ) {
        this.jHipsterProperties = jHipsterProperties;
        this.javaMailSender = javaMailSender;
        this.messageSource = messageSource;
        this.templateEngine = templateEngine;
    }

    @Async
    public void sendEmail(String to, String subject, String content, boolean isMultipart, boolean isHtml) {
        sendEmailSync(to, subject, content, isMultipart, isHtml);
    }

    private void sendEmailSync(String to, String subject, String content, boolean isMultipart, boolean isHtml) {
        LOG.debug(
            "Send email[multipart '{}' and html '{}'] to '{}' with subject '{}' and content={}",
            isMultipart,
            isHtml,
            to,
            subject,
            content
        );

        // Prepare message using a Spring helper
        MimeMessage mimeMessage = javaMailSender.createMimeMessage();
        try {
            MimeMessageHelper message = new MimeMessageHelper(mimeMessage, isMultipart, StandardCharsets.UTF_8.name());
            message.setTo(to);
            message.setFrom(jHipsterProperties.getMail().getFrom());
            message.setSubject(subject);
            message.setText(content, isHtml);
            javaMailSender.send(mimeMessage);
            LOG.debug("Sent email to User '{}'", to);
        } catch (MailException | MessagingException e) {
            LOG.warn("Email could not be sent to user '{}'", to, e);
        }
    }

    @Async
    public void sendEmailFromTemplate(User user, String templateName, String titleKey) {
        sendEmailFromTemplateSync(user, templateName, titleKey);
    }

    private void sendEmailFromTemplateSync(User user, String templateName, String titleKey) {
        sendEmailFromTemplateSync(user, templateName, titleKey, jHipsterProperties.getMail().getBaseUrl());
    }

    private void sendEmailFromTemplateSync(User user, String templateName, String titleKey, String baseUrl) {
        if (user.getEmail() == null) {
            LOG.debug("Email doesn't exist for user '{}'", user.getLogin());
            return;
        }
        Locale locale = Locale.forLanguageTag(user.getLangKey());
        Context context = new Context(locale);
        context.setVariable(USER, user);
        context.setVariable(BASE_URL, baseUrl);
        String content = templateEngine.process(templateName, context);
        String subject = messageSource.getMessage(titleKey, null, locale);
        sendEmailSync(user.getEmail(), subject, content, false, true);
    }

    @Async
    public void sendActivationEmail(User user) {
        LOG.debug("Sending activation email to '{}'", user.getEmail());
        sendEmailFromTemplateSync(user, "mail/activationEmail", "email.activation.title");
    }

    @Async
    public void sendCreationEmail(User user) {
        LOG.debug("Sending creation email to '{}'", user.getEmail());
        sendEmailFromTemplateSync(user, "mail/creationEmail", "email.activation.title");
    }

    /**
     * Phase 14.6: an email said an application reached Interview or Offer. Sent to the account's own
     * address (the user's real one — never the connected job-hunting Gmail).
     */
    @Async
    public void sendStatusChangeEmail(User user, String company, String role, String stage, String link) {
        if (user.getEmail() == null) return;
        Locale locale = Locale.forLanguageTag(user.getLangKey() == null ? "en" : user.getLangKey());
        Context context = new Context(locale);
        context.setVariable("name", user.getFirstName() != null && !user.getFirstName().isBlank() ? user.getFirstName() : user.getLogin());
        context.setVariable("company", company);
        context.setVariable("role", role);
        context.setVariable("stage", stage);
        context.setVariable("link", link);
        String subject = messageSource.getMessage("OFFER".equals(stage) ? "email.status.offer.title" : "email.status.interview.title", new Object[] { company }, locale);
        context.setVariable("subject", subject);
        String content = templateEngine.process("mail/statusChangeEmail", context);
        sendEmailSync(user.getEmail(), subject, content, false, true);
    }

    /**
     * E2E-U7.0: a notice of any kind the user has switched email on for (and that is not held back by quiet
     * hours). The subject is the notice's own title; {@code kindTitle} names what it is about. Sent to the
     * account's own address.
     */
    @Async
    public void sendNotificationEmail(User user, String kindTitle, String title, String body, String link) {
        if (user.getEmail() == null) return;
        Locale locale = Locale.forLanguageTag(user.getLangKey() == null ? "en" : user.getLangKey());
        Context context = new Context(locale);
        context.setVariable("name", user.getFirstName() != null && !user.getFirstName().isBlank() ? user.getFirstName() : user.getLogin());
        context.setVariable("kind", kindTitle);
        context.setVariable("subject", title);
        context.setVariable("body", body);
        context.setVariable("link", link);
        String content = templateEngine.process("mail/notificationEmail", context);
        sendEmailSync(user.getEmail(), title, content, false, true);
    }

    /**
     * O2.2: an organization invited someone by email. Goes to the invited ADDRESS (they may not have an account yet), so it
     * does not take a {@link User}. Says who invited them, what role, what the org pays for, when the link stops working and
     * the "Not you?" line (onboarding-invites.md section 3.2). The link carries the one-time token; it is never logged.
     */
    public void sendOrgInviteEmail(String to, String name, String orgName, String inviterName, String roleWord, List<String> pays, String link, String expires) {
        sendOrgInviteEmail(to, name, orgName, inviterName, roleWord, pays, link, expires, null, null);
    }

    /**
     * The organization-branded form (X1.8/X1.15): {@code logoUrl} is the org logo (null until branding supplies one: the template then
     * shows the name only) and {@code message} the inviter's optional personal note, plain text, escaped by the template.
     */
    @Async
    public void sendOrgInviteEmail(String to, String name, String orgName, String inviterName, String roleWord, List<String> pays, String link, String expires, String message, String logoUrl) {
        if (to == null || to.isBlank()) return;
        Locale locale = Locale.ENGLISH;
        String inviter = inviterName == null || inviterName.isBlank() ? "The " + orgName + " team" : inviterName;
        Context context = new Context(locale);
        context.setVariable("name", name);
        context.setVariable("org", orgName);
        context.setVariable("inviter", inviter);
        context.setVariable("role", roleWord);
        context.setVariable("pays", pays == null ? List.of() : pays);
        context.setVariable("paysList", pays == null ? "" : String.join(", ", pays));
        context.setVariable("link", link);
        context.setVariable("policyBase", originOf(link)); // the footer's Privacy / Terms / Help point at the host the invitation link is on
        context.setVariable("expires", expires);
        context.setVariable("message", message == null || message.isBlank() ? null : message);
        context.setVariable("logoUrl", logoUrl);
        String subject = messageSource.getMessage(
            inviterName == null || inviterName.isBlank() ? "email.invite.title.anon" : "email.invite.title",
            inviterName == null || inviterName.isBlank() ? new Object[] { orgName } : new Object[] { inviterName, orgName },
            locale
        );
        context.setVariable("subject", subject);
        String content = templateEngine.process("mail/orgInviteEmail", context);
        sendEmailSync(to, subject, content, false, true);
    }

    @Async
    public void sendPasswordResetMail(User user, String baseUrl) {
        LOG.debug("Sending password reset email to '{}' (organization host)", user.getEmail());
        sendEmailFromTemplateSync(user, "mail/passwordResetEmail", "email.reset.title", baseUrl);
    }

    @Async
    public void sendPasswordResetMail(User user) {
        LOG.debug("Sending password reset email to '{}'", user.getEmail());
        sendEmailFromTemplateSync(user, "mail/passwordResetEmail", "email.reset.title");
    }

    /**
     * "Your account is ready": an administrator created an account for this person (the owner, by the Kiwiply app admin; an
     * employee, by an Org Admin). The e-mail NEVER carries the temporary password or any other secret: the creator gives it to
     * the person separately, so an inbox alone cannot sign in. A mail failure is logged (no address, no secret) and never
     * fails the caller.
     */
    @Async
    public void sendAccountCreatedEmail(String to, String name, String orgName, String creatorName, String roleLabel, String workspaceLabel, boolean owner, String signInUrl, String expiresText, TenantMailBrand brand) {
        if (to == null || to.isBlank()) return;
        try {
            Locale locale = Locale.ENGLISH;
            Context context = accountContext(locale, to, name, orgName, signInUrl, expiresText, brand);
            context.setVariable("workspaceLabel", workspaceLabel == null || workspaceLabel.isBlank() ? null : workspaceLabel);
            context.setVariable("creatorName", creatorName == null || creatorName.isBlank() ? "Your administrator" : creatorName);
            context.setVariable("roleLabel", roleLabel);
            context.setVariable("owner", owner);
            String subject = messageSource.getMessage("email.created.title", new Object[] { orgName }, locale);
            context.setVariable("subject", subject);
            sendEmailSync(to, subject, templateEngine.process("mail/accountCreatedEmail", context), false, true);
        } catch (RuntimeException e) {
            LOG.warn("Account-created e-mail could not be sent ({})", e.getClass().getSimpleName());
        }
    }

    /** "Your password was reset by an administrator". Like {@link #sendAccountCreatedEmail} it never carries the new password. */
    @Async
    public void sendAdminPasswordResetEmail(String to, String name, String orgName, String actorName, String signInUrl, String expiresText, TenantMailBrand brand) {
        if (to == null || to.isBlank()) return;
        try {
            Locale locale = Locale.ENGLISH;
            Context context = accountContext(locale, to, name, orgName, signInUrl, expiresText, brand);
            context.setVariable("actorName", actorName == null || actorName.isBlank() ? "Your administrator" : actorName);
            String subject = messageSource.getMessage("email.adminreset.title", null, locale);
            context.setVariable("subject", subject);
            sendEmailSync(to, subject, templateEngine.process("mail/passwordResetByAdminEmail", context), false, true);
        } catch (RuntimeException e) {
            LOG.warn("Admin password-reset e-mail could not be sent ({})", e.getClass().getSimpleName());
        }
    }

    /** The model both account e-mails share. {@code to} is the recipient's own address, shown back to them in the login-details card. Never a secret. */
    private Context accountContext(Locale locale, String to, String name, String orgName, String signInUrl, String expiresText, TenantMailBrand brand) {
        TenantMailBrand b = brand == null ? TenantMailBrand.KIWIPLY : brand;
        Context context = new Context(locale);
        context.setVariable("name", name == null || name.isBlank() ? null : name);
        context.setVariable("orgName", orgName);
        context.setVariable("signInUrl", signInUrl);
        context.setVariable("policyBase", originOf(signInUrl)); // the footer links to this host's own policy pages (docs/enterprise-v2/62)
        context.setVariable("expires", expiresText);
        context.setVariable("brand", b.brandHex());
        context.setVariable("logoUrl", b.logoUrl());
        context.setVariable("theme", "enterprise");
        context.setVariable("assetBase", jHipsterProperties.getMail().getBaseUrl() + "/email"); // the art lives in web/public/email
        context.setVariable("email", to);
        return context;
    }

    /** {@code scheme://authority} of an absolute http(s) URL, else null: the organization's own host, used to build its policy-page links. */
    static String originOf(String url) {
        if (url == null || url.isBlank()) return null;
        try {
            java.net.URI u = java.net.URI.create(url.strip());
            String scheme = u.getScheme();
            if (u.getHost() == null || scheme == null || !(scheme.equals("https") || scheme.equals("http"))) return null;
            return scheme + "://" + u.getAuthority();
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
