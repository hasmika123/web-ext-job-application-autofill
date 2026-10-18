package com.dossier.api.service.ent;

/**
 * The neutral starting text of each policy kind (docs/enterprise-v2/62 section 1, decision 6). It is what an organization's host
 * shows until the organization publishes its own, and what "Start from template" puts into the draft. It names only the
 * organization and its support contact: it never mentions or links to the platform operator. The organization is expected to have
 * its own counsel review and replace it. It states, in line with the product rules, that sensitive identifiers (government
 * ids, bank details, dates of birth) are not collected.
 */
public final class PolicyTemplates {

    private PolicyTemplates() {}

    /** @param org the organization's display name; @param contact its support e-mail, or null */
    public static String render(String kind, String org, String contact) {
        String name = org == null || org.isBlank() ? "the organization" : org.strip();
        String reach = contact == null || contact.isBlank() ? "your organization administrator" : "[" + contact.strip() + "](mailto:" + contact.strip() + ")";
        return switch (kind) {
            case PolicyKinds.PRIVACY -> privacy(name, reach);
            case PolicyKinds.TERMS -> terms(name, reach);
            case PolicyKinds.ACCEPTABLE_USE -> acceptableUse(name, reach);
            case PolicyKinds.SUPPORT_CONTACT -> support(name, reach);
            default -> generic(PolicyKinds.title(kind), name, reach);
        };
    }

    private static String privacy(String name, String reach) {
        return """
            # Privacy Policy

            This page explains how %1$s handles personal information in its workspace. It applies to everyone who has an account in the %1$s workspace.

            ## What we collect

            - Your name and work e-mail address, and the role you hold in the workspace.
            - The resumes, applications, interviews and notes you or your colleagues add to the workspace.
            - Basic technical information needed to keep the service secure, such as sign-in times and error logs.

            We do not ask for, accept or store government identity numbers, bank account numbers, tax identifiers or dates of birth.

            ## How we use it

            - To run the workspace and give each person access to what their role allows.
            - To keep the service safe, investigate problems and meet legal duties.
            - Information is only visible to the people in %1$s that your role and sharing settings allow.

            ## Sharing

            We do not sell personal information. We share it only with service providers who help us run the workspace, and when the law requires it.

            ## Keeping and deleting data

            We keep information while your account is active and as long as the organization needs it for the purposes above. You can ask for a copy or for deletion of your information by contacting %2$s.

            ## Contact

            Questions about privacy: %2$s.
            """.formatted(name, reach).stripTrailing();
    }

    private static String terms(String name, String reach) {
        return """
            # Terms of Use

            These terms apply when you use the %1$s workspace. By signing in you agree to them.

            ## Your account

            - Your account is personal to you. Keep your password private and tell us at once if you think someone else has used it.
            - You must give accurate information and keep it up to date.

            ## Using the workspace

            - Use the workspace only for the work of %1$s and in line with the Acceptable Use Policy.
            - Do not try to access information you are not given access to.

            ## Content

            You remain responsible for the content you add. %1$s may remove content that breaks these terms or the law.

            ## Changes and ending access

            %1$s may update these terms and may suspend or end access that breaks them. Continuing to use the workspace after a change means you accept the new terms.

            ## Contact

            Questions about these terms: %2$s.
            """.formatted(name, reach).stripTrailing();
    }

    private static String acceptableUse(String name, String reach) {
        return """
            # Acceptable Use Policy

            This policy sets out what is and is not allowed in the %1$s workspace.

            ## You may

            - Manage your own resumes, applications and interview preparation.
            - Work with colleagues on the records your role gives you access to.

            ## You may not

            - Share your sign-in or use someone else's.
            - Add sensitive identifiers such as government ids, bank details or dates of birth.
            - Upload malicious files, send spam, or try to disrupt the service.
            - Misrepresent your qualifications or submit applications on someone else's behalf without their agreement.

            ## Reporting a problem

            If you see something that breaks this policy, tell %2$s.
            """.formatted(name, reach).stripTrailing();
    }

    private static String support(String name, String reach) {
        return """
            # Support and contact

            Need help with the %1$s workspace?

            ## Contact

            Write to %2$s and tell us what you were trying to do and what happened. Please never include your password or any government or bank identifiers in a message.

            ## Before you write

            - Try signing out and in again.
            - If you forgot your password, use "Forgot password" on the sign-in page.
            - If you cannot see a page you expect, your role may not include it; ask your organization administrator.
            """.formatted(name, reach).stripTrailing();
    }

    private static String generic(String title, String name, String reach) {
        return """
            # %1$s

            This page has not been written yet for %2$s.

            For questions, contact %3$s.
            """.formatted(title, name, reach).stripTrailing();
    }
}
